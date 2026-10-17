#!/usr/bin/env bash
# ============================================================
# KEDAS v3.4.0 Core — Script de Instalación
# Archivo: scripts/install.sh
# Reescrito 14-jul-2026 (INST-01b); corregido 17-oct-2026 tras la
# primera instalación completa en un servidor limpio.
#
# Arquitectura de Core:
#   - Kolibri corre en el HOST como servicio systemd — NUNCA en Docker
#   - 4 contenedores (docker-compose.yml): kedas-postgres, kedas-api,
#     kedas-frontend, kedas-caddy
#   - Backup: Restic -> Backblaze B2, se configura aparte
#   - Crea el administrador inicial con una contraseña temporal que debe
#     cambiarse en el primer ingreso
#
# Compatible con: Ubuntu Server 22.04 LTS, 24.04 LTS
# Uso: sudo bash scripts/install.sh --perfil urbano [--silencioso] [--dominio kedas.midominio.cl]
# Licencia: AGPL v3 (ver LICENSE) — este script vive en kedas-core
# ============================================================
set -euo pipefail

# ── Colores ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

# ── Parámetros ─────────────────────────────────────────────
SILENCIOSO=false
PERFIL=""
DOMINIO=""
KEDAS_HOME="/opt/kedas"
KEDAS_USER="kedas-admin"
LOG_FILE="/var/log/kedas_install.log"
REPO_URL="https://github.com/kli-eng/kedas-core.git"
KOLIBRI_VERSION="0.19.5"
SSH_PORT="2222"
PERFILES_VALIDOS=("rural-extremo" "rural" "urbano" "slep-multitenant")

while [[ $# -gt 0 ]]; do
    case "$1" in
        --silencioso|--silent) SILENCIOSO=true; shift ;;
        --perfil)              PERFIL="$2"; shift 2 ;;
        --dominio)              DOMINIO="$2"; shift 2 ;;
        --ayuda|--help)
            echo "Uso: sudo bash install.sh --perfil urbano [--silencioso] [--dominio dominio.cl]"
            echo "  --perfil:     rural-extremo | rural | urbano | slep-multitenant"
            echo "  --silencioso: sin prompts interactivos"
            echo "  --dominio:    dominio público (ej: kedas.micolegio.cl)"
            echo ""
            echo "NOTA: este instalador (kedas-core) NO incluye módulos Premium"
            echo "(Convivencia avanzada, Inteligencia Curricular, KIRA, Predicciones,"
            echo "Reportes SLEP) — instala únicamente la plataforma base gratuita."
            echo "Para módulos Premium, ver el instalador de kedas (Tier 1/2/3)."
            exit 0 ;;
        *) echo "Argumento no reconocido: $1"; exit 1 ;;
    esac
done

if [[ -z "$PERFIL" ]]; then
    if ! $SILENCIOSO; then
        echo "¿Qué perfil de hardware corresponde a este servidor?"
        echo "  1) rural-extremo   — 2 núcleos, 4GB RAM, sin internet estable"
        echo "  2) rural           — 4 núcleos, 8GB RAM, internet limitado"
        echo "  3) urbano          — 6 núcleos, 12GB RAM, internet estable"
        echo "  4) slep-multitenant — 8+ núcleos, 16GB RAM, multi-establecimiento"
        read -rp "Seleccione [1-4]: " opcion
        case "$opcion" in
            1) PERFIL="rural-extremo" ;;
            2) PERFIL="rural" ;;
            3) PERFIL="urbano" ;;
            4) PERFIL="slep-multitenant" ;;
            *) echo "Opción inválida."; exit 1 ;;
        esac
    else
        echo -e "${RED}Error: --perfil es obligatorio en modo --silencioso.${NC}"
        exit 1
    fi
fi

if [[ ! " ${PERFILES_VALIDOS[*]} " =~ " ${PERFIL} " ]]; then
    echo -e "${RED}Error: perfil '$PERFIL' no reconocido.${NC} Válidos: ${PERFILES_VALIDOS[*]}"
    exit 1
fi

# ── Logging ────────────────────────────────────────────────
log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')] ✓${NC} $*" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ${NC} $*"  | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date +'%H:%M:%S')] ✗${NC} $*"    | tee -a "$LOG_FILE"; }

RESULTADOS_CHECK=()
check_pass() { RESULTADOS_CHECK+=("PASS: $1"); }
check_fail() { RESULTADOS_CHECK+=("FAIL: $1"); }

mostrar_banner() {
cat << 'BANNER'
╔══════════════════════════════════════════════════════════╗
║          KEDAS v3.4.0 Core — Instalación                 ║
║      Plataforma de Inteligencia Escolar (AGPL v3)        ║
║      Kairós Learning Intelligent (KLI) — 2026            ║
╚══════════════════════════════════════════════════════════╝
BANNER
    echo ""
}

# ══════════════════════════════════════════════════════════════
# VERIFICACIONES PREVIAS
# ══════════════════════════════════════════════════════════════

verificar_root() {
    [[ $EUID -eq 0 ]] || { err "Este script debe ejecutarse como root o con sudo."; exit 1; }
    log "Ejecutando como root."
}

verificar_sistema_operativo() {
    [[ -f /etc/os-release ]] || { err "Sistema operativo no soportado."; exit 1; }
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]] || [[ "$VERSION_ID" != "22.04" && "$VERSION_ID" != "24.04" ]]; then
        warn "Sistema detectado: $PRETTY_NAME — se recomienda Ubuntu 24.04 LTS."
        if ! $SILENCIOSO; then
            read -rp "¿Continuar de todas formas? (s/N): " resp
            [[ "${resp,,}" == "s" ]] || exit 1
        fi
    else
        log "Sistema operativo: $PRETTY_NAME — compatible."
    fi
}

verificar_hardware_minimo() {
    info "Verificando hardware mínimo (perfil: $PERFIL)..."
    RAM_GB=$(awk '/MemTotal/ {printf "%.0f\n", $2/1024/1024}' /proc/meminfo)
    [[ $RAM_GB -ge 4 ]] && log "RAM: ${RAM_GB}GB" || warn "RAM: ${RAM_GB}GB — se recomiendan al menos 4GB (PostgreSQL, API, Kolibri)."
    DISCO_GB=$(df -BG "$KEDAS_HOME" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}' || df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
    [[ $DISCO_GB -ge 30 ]] && log "Espacio libre: ${DISCO_GB}GB" || warn "Espacio libre: ${DISCO_GB}GB — se recomiendan al menos 30GB."
    log "CPUs disponibles: $(nproc)"
}

registrar_perfil() {
    log "Perfil de instalación seleccionado: $PERFIL"
    info "Este dato queda registrado en .env (KEDAS_PERFIL_INSTALACION) para referencia futura."
}

verificar_usuario_kedas() {
    info "Verificando usuario del sistema $KEDAS_USER..."
    if id "$KEDAS_USER" &>/dev/null; then
        log "Usuario $KEDAS_USER ya existe."
    else
        useradd -m -s /bin/bash "$KEDAS_USER"
        usermod -aG sudo "$KEDAS_USER"
        log "Usuario $KEDAS_USER creado (con home y permisos sudo)."
        warn "Se creó $KEDAS_USER sin contraseña interactiva — configurar acceso SSH propio o clave si se usará para login directo."
    fi
}

# ══════════════════════════════════════════════════════════════
# PASO 1 — SISTEMA BASE
# ══════════════════════════════════════════════════════════════

instalar_dependencias_sistema() {
    info "Paso 1: Instalando dependencias del sistema..."
    apt-get update -qq >> "$LOG_FILE" 2>&1
    apt-get install -y -qq \
        curl wget git openssl ca-certificates gnupg lsb-release \
        ufw fail2ban python3 python3-pip python3-venv \
        postgresql-client >> "$LOG_FILE" 2>&1
    log "Dependencias del sistema instaladas."
}

configurar_firewall() {
    info "Configurando firewall (UFW) — réplica de la config verificada en producción..."
    ufw --force reset >> "$LOG_FILE" 2>&1
    ufw default deny incoming >> "$LOG_FILE" 2>&1
    ufw default allow outgoing >> "$LOG_FILE" 2>&1
    # Se abren los puertos en que SSH escucha HOY, además de ${SSH_PORT}:
    # abrir solo ${SSH_PORT} sin haber cambiado sshd dejaba el servidor sin
    # acceso remoto al cerrar la sesión (prueba en servidor limpio, 16-oct-2026).
    PUERTOS_SSH=$(sshd -T 2>/dev/null | awk '$1=="port" {print $2}' | sort -u)
    [[ -n "$PUERTOS_SSH" ]] || PUERTOS_SSH="22"
    for puerto in $PUERTOS_SSH ${SSH_PORT}; do
        ufw limit "${puerto}/tcp" comment "SSH - rate limited" >> "$LOG_FILE" 2>&1
    done
    ufw allow 80/tcp  comment "HTTP para nginx/Caddy + ACME http-01" >> "$LOG_FILE" 2>&1
    ufw allow 443/tcp comment "HTTPS para Caddy KEDAS+Kolibri" >> "$LOG_FILE" 2>&1
    ufw allow 8080/tcp comment "Kolibri directo" >> "$LOG_FILE" 2>&1
    ufw --force enable >> "$LOG_FILE" 2>&1
    log "Firewall configurado: SSH en $(echo $PUERTOS_SSH ${SSH_PORT} | tr ' ' '\n' | sort -u | tr '\n' ' ')(rate-limited), 80, 443, 8080."
    if ! grep -qx "${SSH_PORT}" <<< "$PUERTOS_SSH"; then
        warn "SSH escucha hoy en: $(echo $PUERTOS_SSH). Se dejaron abiertos para no perder el acceso."
        warn "Si cambia SSH a ${SSH_PORT}, cierre después el puerto anterior con: ufw delete limit <puerto>/tcp"
    fi
}

configurar_fail2ban() {
    info "Habilitando fail2ban..."
    systemctl enable fail2ban >> "$LOG_FILE" 2>&1
    systemctl start fail2ban >> "$LOG_FILE" 2>&1
    log "fail2ban activo."
}

# ══════════════════════════════════════════════════════════════
# PASO 2 — DOCKER
# ══════════════════════════════════════════════════════════════

instalar_docker() {
    info "Paso 2: Instalando Docker Engine..."
    if command -v docker &>/dev/null; then
        log "Docker ya instalado: $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"
    else
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc >> "$LOG_FILE" 2>&1
        chmod a+r /etc/apt/keyrings/docker.asc
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
            https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
            tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -qq >> "$LOG_FILE" 2>&1
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin >> "$LOG_FILE" 2>&1
        log "Docker instalado: $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"
    fi
    usermod -aG docker "$KEDAS_USER" 2>/dev/null || true
    systemctl enable docker >> "$LOG_FILE" 2>&1
    systemctl start docker  >> "$LOG_FILE" 2>&1
}

# ══════════════════════════════════════════════════════════════
# PASO 3 — REPOSITORIO
# ══════════════════════════════════════════════════════════════

configurar_repositorio() {
    info "Paso 3: Configurando repositorio KEDAS ($REPO_URL)..."
    mkdir -p "$KEDAS_HOME"
    # Git moderno bloquea operaciones si el dueño del repo en disco no coincide
    # con el usuario que ejecuta el comando ("dubious ownership"). Este script
    # corre como root pero deja el repo con dueño $KEDAS_USER (chown abajo) —
    # descubierto en la prueba de despliegue desde cero, DEC-49.
    git config --global --add safe.directory "$KEDAS_HOME"
    if [[ -d "$KEDAS_HOME/.git" ]]; then
        log "Repositorio ya existe. Actualizando..."
        git -C "$KEDAS_HOME" pull origin main >> "$LOG_FILE" 2>&1
    else
        git clone "$REPO_URL" "$KEDAS_HOME" >> "$LOG_FILE" 2>&1
        log "Repositorio clonado desde $REPO_URL"
    fi
    chown -R "$KEDAS_USER:$KEDAS_USER" "$KEDAS_HOME"
}

# ══════════════════════════════════════════════════════════════
# PASO 4 — KOLIBRI EN EL HOST (no Docker)
# ══════════════════════════════════════════════════════════════

instalar_kolibri_host() {
    info "Paso 4: Instalando Kolibri ${KOLIBRI_VERSION} en el host (NO Docker)..."
    if command -v kolibri &>/dev/null; then
        log "Kolibri ya instalado: $(kolibri --version 2>/dev/null || echo 'versión desconocida')"
    else
        pip3 install --break-system-packages "kolibri==${KOLIBRI_VERSION}" >> "$LOG_FILE" 2>&1
        log "Kolibri ${KOLIBRI_VERSION} instalado vía pip."
    fi

    if systemctl is-enabled kolibri &>/dev/null; then
        log "Servicio kolibri ya habilitado."
    else
        info "Creando servicio systemd de Kolibri (hallazgo real, probado en VPS desechable, 21-sep-2026)..."
        KOLIBRI_HOME_DIR="$(getent passwd "$KEDAS_USER" | cut -d: -f6)/.kolibri"
        cat > /etc/systemd/system/kolibri.service << KOLIBRISVCEOF
[Unit]
Description=Kolibri (plataforma de aprendizaje, usada por KEDAS)
After=network.target

[Service]
Type=simple
User=${KEDAS_USER}
Environment="KOLIBRI_HOME=${KOLIBRI_HOME_DIR}"
ExecStart=/usr/local/bin/kolibri start --port 8080 --foreground
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
KOLIBRISVCEOF
        systemctl daemon-reload
        systemctl enable kolibri >> "$LOG_FILE" 2>&1
        log "Servicio systemd de Kolibri creado y habilitado."
    fi

    systemctl start kolibri 2>> "$LOG_FILE" || warn "No se pudo iniciar kolibri automáticamente — revisar manualmente."
    log "Kolibri configurado para correr en el host, puerto 8080."
}

# ══════════════════════════════════════════════════════════════
# PASO 5 — VARIABLES DE ENTORNO
# ══════════════════════════════════════════════════════════════

configurar_variables_entorno() {
    info "Paso 5: Configurando variables de entorno..."
    ENV_FILE="$KEDAS_HOME/.env"
    if [[ -f "$ENV_FILE" ]]; then
        log "Archivo .env ya existe. No se sobreescribe."
        return
    fi

    JWT_SECRET=$(openssl rand -hex 32)
    PSEUDO_SALT=$(openssl rand -hex 24)
    PGCRYPTO_KEY=$(openssl rand -base64 32)
    PG_PASSWORD=$(openssl rand -hex 16)
    INSTALL_TOKEN=$(openssl rand -hex 32)

    if ! $SILENCIOSO && [[ -z "$DOMINIO" ]]; then
        read -rp "Ingrese el dominio del establecimiento (ej: kedas.micolegio.cl): " DOMINIO
    fi
    DOMINIO="${DOMINIO:-kedas.local}"

    cat > "$ENV_FILE" << EOF
# KEDAS v3.4.0 — Variables de Entorno
# Generado automáticamente el $(date)
# MANTENER ESTE ARCHIVO SEGURO — chmod 600 .env

KEDAS_PERFIL_INSTALACION=${PERFIL}
CADDY_DOMAIN=${DOMINIO}

POSTGRES_DB=kedas_db
POSTGRES_USER=kedas
POSTGRES_PASSWORD=${PG_PASSWORD}

KEDAS_JWT_SECRET=${JWT_SECRET}
KEDAS_PSEUDONIMO_SALT=${PSEUDO_SALT}
KEDAS_PGCRYPTO_KEY=${PGCRYPTO_KEY}
KEDAS_ALLOWED_ORIGINS=https://${DOMINIO}

# Solo para crear el administrador inicial; el instalador lo vacía al terminar.
KEDAS_INSTALL_TOKEN=${INSTALL_TOKEN}
EOF

    chmod 600 "$ENV_FILE"
    chown "$KEDAS_USER:$KEDAS_USER" "$ENV_FILE"
    log "Variables de entorno generadas en $ENV_FILE"

    CRED_FILE="/root/kedas_credenciales_$(date +%Y%m%d).txt"
    cat > "$CRED_FILE" << EOF
KEDAS v3.4.0 — Credenciales de Administración
Generado: $(date)
GUARDAR EN LUGAR SEGURO — ELIMINAR DESPUÉS DE ANOTAR

Dominio:  https://${DOMINIO}
PostgreSQL: usuario 'kedas', password ${PG_PASSWORD}

RECORDATORIO: configurar backup Restic -> Backblaze B2 por separado
(ver scripts/configurar_backup.sh) — requiere cuenta B2 propia del cliente
o de KLI según el contrato.
EOF
    chmod 600 "$CRED_FILE"
    info "Credenciales guardadas en: $CRED_FILE"
}

# ══════════════════════════════════════════════════════════════
# PASO 6 — LEVANTAR SERVICIOS DOCKER
# ══════════════════════════════════════════════════════════════

levantar_servicios() {
    info "Paso 6: Levantando servicios Docker..."
    cd "$KEDAS_HOME"

    # Core usa solo docker-compose.yml (4 servicios). Los servicios de IA
    # (Ollama) y MLflow pertenecen a módulos Premium.
    if ! docker compose -f docker-compose.yml up -d --build >> "$LOG_FILE" 2>&1; then
        err "No se pudieron levantar los contenedores. Revise $LOG_FILE"
        exit 1
    fi

    info "Esperando que la API responda (hasta 5 minutos)..."
    INTENTOS=0
    until curl -sf --max-time 5 "http://127.0.0.1:8001/health" > /dev/null 2>&1; do
        INTENTOS=$((INTENTOS+1))
        [[ $INTENTOS -ge 30 ]] && { err "La API no responde después de 5 minutos. Revise: docker logs kedas-api"; exit 1; }
        sleep 10
    done
    log "API en línea."

    SERVICIOS_REQUERIDOS=("kedas-postgres" "kedas-api" "kedas-caddy" "kedas-frontend")
    for servicio in "${SERVICIOS_REQUERIDOS[@]}"; do
        STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$servicio" 2>/dev/null || echo "sin_healthcheck")
        RUNNING=$(docker inspect --format='{{.State.Running}}' "$servicio" 2>/dev/null || echo "false")
        if [[ "$STATUS" == "healthy" ]] || [[ "$RUNNING" == "true" && "$STATUS" == "sin_healthcheck" ]]; then
            log "Servicio $servicio: OK ($STATUS)"
        else
            warn "Servicio $servicio: $STATUS — puede tardar más en inicializar."
        fi
    done
}

# ══════════════════════════════════════════════════════════════
# PASO 7 — MIGRACIONES (según módulos elegidos)
# ══════════════════════════════════════════════════════════════

aplicar_migraciones() {
    info "Paso 7: Aplicando migraciones de la plataforma base (Core)..."
    cd "$KEDAS_HOME"

    INTENTOS=0
    until docker exec kedas-postgres pg_isready -U kedas -d kedas_db > /dev/null 2>&1; do
        INTENTOS=$((INTENTOS+1))
        [[ $INTENTOS -ge 30 ]] && { err "PostgreSQL no responde después de 5 minutos."; exit 1; }
        sleep 10
    done
    log "PostgreSQL está listo."

    if [[ ! -d "migrations" ]]; then
        warn "No se encontró carpeta migrations/ en este repo (kedas-core) — nada que aplicar."
        return
    fi

    # Una base que ya tiene usuarios no se toca: las migraciones de Core no
    # están pensadas para aplicarse dos veces (la 011 se detiene a propósito).
    YA_INICIALIZADA=$(docker exec kedas-postgres psql -U kedas -d kedas_db -tAc \
        "SELECT to_regclass('public.kedas_usuarios') IS NOT NULL" 2>/dev/null || echo "error")
    if [[ "$YA_INICIALIZADA" == "t" ]]; then
        warn "La base ya está inicializada (existe kedas_usuarios): no se aplica ninguna migración."
        warn "Las migraciones nuevas se aplican a mano, una por una, con respaldo previo."
        return
    elif [[ "$YA_INICIALIZADA" != "f" ]]; then
        err "No se pudo consultar el estado de la base."; exit 1
    fi

    for migracion in $(ls migrations/*.sql 2>/dev/null | LC_ALL=C sort); do
        info "Aplicando: $(basename "$migracion")"
        if ! docker exec -i kedas-postgres psql -v ON_ERROR_STOP=1 -U kedas -d kedas_db \
                < "$migracion" >> "$LOG_FILE" 2>&1; then
            err "Falló la migración $(basename "$migracion"). La instalación se detiene."
            err "Detalle en $LOG_FILE"
            exit 1
        fi
    done

    log "Migraciones Core aplicadas."
    warn "Este servidor NO tiene módulos Premium instalados (Convivencia avanzada,"
    warn "Inteligencia Curricular, KIRA, Predicciones, Reportes SLEP) — para activarlos"
    warn "se requiere una licencia comercial KLI y el instalador de kedas."
}

# ══════════════════════════════════════════════════════════════
# PASO 7b — ADMINISTRADOR INICIAL
# ══════════════════════════════════════════════════════════════

crear_admin_inicial() {
    info "Paso 7b: Creando el administrador inicial..."
    cd "$KEDAS_HOME"
    source "$KEDAS_HOME/.env"
    if [[ -z "${KEDAS_INSTALL_TOKEN:-}" ]]; then
        warn "KEDAS_INSTALL_TOKEN está vacío: el administrador inicial ya se creó en una instalación anterior."
        return
    fi

    ADMIN_USER="admin"
    if ! $SILENCIOSO; then
        read -rp "Nombre de usuario del administrador [admin]: " resp
        ADMIN_USER="${resp:-admin}"
    fi
    if [[ ! "$ADMIN_USER" =~ ^[a-z0-9._-]{3,64}$ ]]; then
        err "Nombre de usuario no válido: use de 3 a 64 caracteres en minúscula, números, punto, guion o guion bajo."
        exit 1
    fi

    # Contraseña temporal aleatoria de 20 caracteres. No se muestra ni va al
    # log: queda solo en el archivo de credenciales de /root (permisos 600).
    # La API obliga a cambiarla en el primer ingreso (DEC-73).
    HDR=$(mktemp); RESP=$(mktemp); chmod 600 "$HDR" "$RESP"
    printf 'X-Install-Token: %s\n' "$KEDAS_INSTALL_TOKEN" > "$HDR"
    CODIGO=""
    for _ in 1 2 3; do
        ADMIN_PW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 20)
        CODIGO=$(printf '{"username":"%s","password":"%s","nombre_completo":"Administrador KEDAS"}' \
                     "$ADMIN_USER" "$ADMIN_PW" | \
                 curl -s -o "$RESP" -w '%{http_code}' --max-time 20 \
                     -H "Content-Type: application/json" -H @"$HDR" --data-binary @- \
                     "http://127.0.0.1:8001/api/v1/auth/init-admin" || true)
        [[ "$CODIGO" == "400" ]] || break   # 400 = la contraseña generada no pasó la política; se genera otra
    done
    rm -f "$HDR"

    case "$CODIGO" in
        201)
            CRED_FILE=$(ls -t /root/kedas_credenciales_*.txt 2>/dev/null | head -1 || true)
            [[ -n "$CRED_FILE" ]] || { CRED_FILE="/root/kedas_credenciales_$(date +%Y%m%d).txt"; install -m 600 /dev/null "$CRED_FILE"; }
            {
                echo ""
                echo "Administrador inicial de KEDAS"
                echo "  Usuario:               ${ADMIN_USER}"
                echo "  Contraseña temporal:   ${ADMIN_PW}"
                echo "  Al entrar por primera vez, KEDAS pide elegir una contraseña nueva"
                echo "  (al menos 15 caracteres). Borre este archivo después de anotarla."
            } >> "$CRED_FILE"
            log "Administrador '${ADMIN_USER}' creado. Contraseña temporal en: $CRED_FILE"
            ;;
        409) warn "Ya existe un administrador: no se creó otro." ;;
        *)   err "No se pudo crear el administrador (HTTP $CODIGO). Respuesta: $(head -c 300 "$RESP")"
             rm -f "$RESP"; unset ADMIN_PW; exit 1 ;;
    esac
    rm -f "$RESP"; unset ADMIN_PW

    # Cierra init-admin: vacía el token y recrea la API para que lo pierda.
    sed -i 's/^KEDAS_INSTALL_TOKEN=.*/KEDAS_INSTALL_TOKEN=/' "$KEDAS_HOME/.env"
    docker compose -f docker-compose.yml up -d --force-recreate api >> "$LOG_FILE" 2>&1
    INTENTOS=0
    until curl -sf --max-time 5 "http://127.0.0.1:8001/health" > /dev/null 2>&1; do
        INTENTOS=$((INTENTOS+1)); [[ $INTENTOS -ge 18 ]] && { warn "La API tarda en volver tras el reinicio."; break; }
        sleep 10
    done
    log "Token de instalación retirado; init-admin queda cerrado."
}

# ══════════════════════════════════════════════════════════════
# PASO 8 — BACKUP (Restic + Backblaze B2)
# ══════════════════════════════════════════════════════════════

configurar_backup() {
    info "Paso 8: Configurando backup automático (Restic + Backblaze B2)..."
    warn "Este paso requiere credenciales B2 propias (B2_ACCOUNT_ID, B2_ACCOUNT_KEY,"
    warn "RESTIC_REPOSITORY, RESTIC_PASSWORD) — no se generan automáticamente."
    warn "Ver scripts/configurar_backup.sh para el asistente de configuración interactivo."
}

# ══════════════════════════════════════════════════════════════
# CHECKLIST FINAL
# ══════════════════════════════════════════════════════════════

verificacion_final() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}    CHECKLIST DE VERIFICACIÓN FINAL — KEDAS v3.4.0     ${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"

    source "$KEDAS_HOME/.env" 2>/dev/null || true

    if docker exec kedas-postgres pg_isready -U kedas -d kedas_db > /dev/null 2>&1; then
        echo -e "  ${GREEN}[PASS]${NC} 1. PostgreSQL responde"; check_pass "PostgreSQL"
    else
        echo -e "  ${RED}[FAIL]${NC} 1. PostgreSQL no responde"; check_fail "PostgreSQL"
    fi

    if curl -sf --max-time 10 "http://localhost:8001/health" > /dev/null 2>&1; then
        echo -e "  ${GREEN}[PASS]${NC} 2. API responde en /health"; check_pass "API"
    else
        echo -e "  ${YELLOW}[WARN]${NC} 2. API aún no responde"; check_fail "API (puede tardar)"
    fi

    if systemctl is-active kolibri &>/dev/null; then
        echo -e "  ${GREEN}[PASS]${NC} 3. Kolibri activo (host, systemd)"; check_pass "Kolibri"
    else
        echo -e "  ${RED}[FAIL]${NC} 3. Kolibri no está activo"; check_fail "Kolibri"
    fi

    ENV_PERMS=$(stat -c "%a" "$KEDAS_HOME/.env" 2>/dev/null || echo "000")
    if [[ "$ENV_PERMS" == "600" ]]; then
        echo -e "  ${GREEN}[PASS]${NC} 4. .env protegido (600)"; check_pass ".env permisos"
    else
        echo -e "  ${RED}[FAIL]${NC} 4. .env permisos inseguros: $ENV_PERMS"; check_fail ".env permisos"
        chmod 600 "$KEDAS_HOME/.env"
    fi

    if docker ps --filter "name=kedas-caddy" --filter "status=running" | grep -q caddy; then
        echo -e "  ${GREEN}[PASS]${NC} 5. Caddy en ejecución (TLS automático)"; check_pass "Caddy"
    else
        echo -e "  ${RED}[FAIL]${NC} 5. Caddy no está en ejecución"; check_fail "Caddy"
    fi

    if ufw status | grep -q "Status: active"; then
        echo -e "  ${GREEN}[PASS]${NC} 6. Firewall UFW activo"; check_pass "UFW"
    else
        echo -e "  ${RED}[FAIL]${NC} 6. Firewall UFW no activo"; check_fail "UFW"
    fi

    if systemctl is-active fail2ban &>/dev/null; then
        echo -e "  ${GREEN}[PASS]${NC} 7. fail2ban activo"; check_pass "fail2ban"
    else
        echo -e "  ${RED}[FAIL]${NC} 7. fail2ban no activo"; check_fail "fail2ban"
    fi

    TABLAS=$(docker exec kedas-postgres psql -U kedas -d kedas_db -c "\dt kedas_*" --tuples-only 2>/dev/null | wc -l || echo "0")
    echo -e "  ${BLUE}[INFO]${NC} 8. Tablas KEDAS Core presentes: $TABLAS (perfil: $PERFIL)"

    echo ""
    PASS_COUNT=$(printf '%s\n' "${RESULTADOS_CHECK[@]}" | grep -c "^PASS" || true)
    FAIL_COUNT=$(printf '%s\n' "${RESULTADOS_CHECK[@]}" | grep -c "^FAIL" || true)
    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}  INSTALACIÓN EXITOSA: $PASS_COUNT/7 verificaciones PASS${NC}"
    else
        echo -e "${YELLOW}${BOLD}  INSTALACIÓN PARCIAL: $PASS_COUNT PASS / $FAIL_COUNT FAIL${NC}"
        echo -e "${YELLOW}  Revisar los FAIL arriba.${NC}"
    fi
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Acceso: https://${CADDY_DOMAIN:-kedas.local}${NC}"
    echo -e "  Kolibri: http://IP_DEL_SERVIDOR:8080"
    echo -e "  Administrador inicial y contraseñas: /root/kedas_credenciales_*.txt (borrar tras anotar)"
    echo -e "  Log: $LOG_FILE"
    echo ""
    warn "PENDIENTE: configurar backup Restic->B2 manualmente (Paso 8) antes de producción real."
}

# ══════════════════════════════════════════════════════════════
# FLUJO PRINCIPAL
# ══════════════════════════════════════════════════════════════

main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    install -m 600 /dev/null "$LOG_FILE"
    echo "=== KEDAS v3.4.0 Instalación (kedas-core) — $(date) — Perfil: $PERFIL ===" >> "$LOG_FILE"

    mostrar_banner

    if ! $SILENCIOSO; then
        echo -e "${BOLD}Este script instalará KEDAS v3.4.0 Core (plataforma base gratuita) — perfil: $PERFIL${NC}"
        echo -e "${YELLOW}No incluye módulos Premium (Convivencia avanzada, Curricular, KIRA, Predicciones, Reportes SLEP).${NC}"
        read -rp "¿Continuar? (s/N): " CONFIRMAR
        [[ "${CONFIRMAR,,}" == "s" ]] || { echo "Instalación cancelada."; exit 0; }
    fi

    verificar_root
    verificar_sistema_operativo
    verificar_hardware_minimo
    verificar_usuario_kedas
    registrar_perfil
    instalar_dependencias_sistema
    configurar_firewall
    configurar_fail2ban
    instalar_docker
    configurar_repositorio
    instalar_kolibri_host
    configurar_variables_entorno
    levantar_servicios
    aplicar_migraciones
    crear_admin_inicial
    configurar_backup
    verificacion_final

    echo -e "${GREEN}${BOLD}Instalación KEDAS v3.4.0 completada.${NC}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
