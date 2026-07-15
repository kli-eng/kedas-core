#!/usr/bin/env bash
# ============================================================
# KEDAS v3.4.0 — Script de Instalación (perfil Urbano)
# Archivo: scripts/install.sh
# Reescrito 14-jul-2026 (INST-01b) — reemplaza la versión v3.0
# que describía servicios que nunca existieron en producción real
# (kedas-kolibri como container, MinIO, Grafana, Metabase, Keycloak).
#
# Arquitectura verificada contra el VPS de producción real (Contabo):
#   - Kolibri corre en el HOST como servicio systemd/init.d — NUNCA en Docker
#   - 6 containers: kedas-caddy, kedas-frontend, kedas-api, kedas-postgres,
#     kedas-ollama, kedas-mlflow
#   - Backup: Restic -> Backblaze B2 (offsite real, no MinIO local)
#   - Sin Grafana/Prometheus/MinIO — simplificación intencional, no brecha
#
# Compatible con: Ubuntu Server 22.04 LTS, 24.04 LTS
# Uso: sudo bash scripts/install.sh --modulos MOD-02,MOD-04 [--silencioso] [--dominio kedas.midominio.cl]
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
KOLIBRI_VERSION="0.19.4"
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
            echo "Para módulos Premium, ver el instalador de kedas-premium (Tier 1/2/3)."
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
║        KEDAS v3.4.0 — Instalación (Perfil Urbano)        ║
║      Kolibri Educational Data AI System                  ║
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
    info "Verificando hardware mínimo (perfil Urbano: 6 núcleos, 12GB RAM recomendado)..."
    RAM_GB=$(awk '/MemTotal/ {printf "%.0f\n", $2/1024/1024}' /proc/meminfo)
    [[ $RAM_GB -ge 8 ]] && log "RAM: ${RAM_GB}GB" || warn "RAM: ${RAM_GB}GB — se recomienda mínimo 8GB (Ollama + Postgres + servicios)."
    DISCO_GB=$(df -BG "$KEDAS_HOME" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}' || df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
    [[ $DISCO_GB -ge 30 ]] && log "Espacio libre: ${DISCO_GB}GB" || warn "Espacio libre: ${DISCO_GB}GB — se recomiendan al menos 30GB."
    log "CPUs disponibles: $(nproc)"
}

registrar_perfil() {
    log "Perfil de instalación seleccionado: $PERFIL"
    info "Este dato queda registrado en .env (KEDAS_PERFIL_INSTALACION) para referencia futura."
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
    ufw limit ${SSH_PORT}/tcp comment "SSH custom port - rate limited" >> "$LOG_FILE" 2>&1
    ufw allow 80/tcp  comment "HTTP para nginx/Caddy + ACME http-01" >> "$LOG_FILE" 2>&1
    ufw allow 443/tcp comment "HTTPS para Caddy KEDAS+Kolibri" >> "$LOG_FILE" 2>&1
    ufw allow 8080/tcp comment "Kolibri directo" >> "$LOG_FILE" 2>&1
    ufw --force enable >> "$LOG_FILE" 2>&1
    log "Firewall configurado: ${SSH_PORT} (SSH, rate-limited), 80, 443, 8080."
    warn "IMPORTANTE: cambiar el puerto SSH del sistema a ${SSH_PORT} en /etc/ssh/sshd_config si aún no se hizo."
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

    # Servicio systemd/init.d — verificado en producción como servicio LSB (init.d) habilitado
    if systemctl is-enabled kolibri &>/dev/null; then
        log "Servicio kolibri ya habilitado."
    else
        warn "Servicio systemd de Kolibri no configurado automáticamente por este script."
        warn "Verificar manualmente: la instalación real usa /etc/init.d/kolibri (LSB), 'systemctl enable kolibri'."
        warn "# VERIFICAR: este paso replica lo observado en producción, pero el mecanismo exacto"
        warn "# de creación del unit/init script de Kolibri no se registró paso a paso durante la instalación original."
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

    # VERIFICAR: se asume docker-compose.yml (base) reproduce los 6 servicios
    # reales de producción (kedas-caddy, kedas-frontend, kedas-api, kedas-postgres,
    # kedas-ollama, kedas-mlflow). Esto no se contrastó línea por línea contra
    # Contabo en esta sesión — confirmar antes del primer uso real de este script.
    docker compose up -d >> "$LOG_FILE" 2>&1

    log "Servicios Docker iniciados. Esperando inicialización (30s)..."
    sleep 30

    SERVICIOS_REQUERIDOS=("kedas-postgres" "kedas-api" "kedas-caddy" "kedas-frontend" "kedas-ollama" "kedas-mlflow")
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

    # kedas-core NO incluye módulos Premium (Convivencia avanzada, Curricular, KIRA,
    # Predicciones, Reportes SLEP) — aplica únicamente las migraciones de plataforma
    # base presentes en este repositorio, en orden numérico.
    for migracion in $(ls migrations/*.sql 2>/dev/null | sort -V); do
        info "Aplicando: $(basename "$migracion")"
        docker exec -i kedas-postgres psql -U kedas -d kedas_db < "$migracion" >> "$LOG_FILE" 2>&1
    done

    log "Migraciones Core aplicadas."
    warn "Este servidor NO tiene módulos Premium instalados (Convivencia avanzada,"
    warn "Inteligencia Curricular, KIRA, Predicciones, Reportes SLEP) — para activarlos"
    warn "se requiere una licencia comercial KLI y el instalador de kedas-premium."
}

# ══════════════════════════════════════════════════════════════
# PASO 8 — BACKUP (Restic + Backblaze B2)
# ══════════════════════════════════════════════════════════════

configurar_backup() {
    info "Paso 8: Configurando backup automático (Restic + Backblaze B2)..."
    warn "Este paso requiere credenciales B2 propias (B2_ACCOUNT_ID, B2_ACCOUNT_KEY,"
    warn "RESTIC_REPOSITORY, RESTIC_PASSWORD) — no se generan automáticamente."
    warn "Ver scripts/configurar_backup.sh (pendiente de escribir, INST-01b futuro)"
    warn "para el asistente de configuración interactivo."
    # Cron real verificado en producción: diario 3 AM, dump de Postgres + directorio del proyecto
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
    PASS_COUNT=$(printf '%s\n' "${RESULTADOS_CHECK[@]}" | grep -c "^PASS" || echo 0)
    FAIL_COUNT=$(printf '%s\n' "${RESULTADOS_CHECK[@]}" | grep -c "^FAIL" || echo 0)
    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}  INSTALACIÓN EXITOSA: $PASS_COUNT/7 verificaciones PASS${NC}"
    else
        echo -e "${YELLOW}${BOLD}  INSTALACIÓN PARCIAL: $PASS_COUNT PASS / $FAIL_COUNT FAIL${NC}"
        echo -e "${YELLOW}  Revisar los FAIL arriba.${NC}"
    fi
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Acceso: https://${CADDY_DOMAIN:-kedas.local}${NC}"
    echo -e "  Kolibri: http://IP_DEL_SERVIDOR:8080"
    echo -e "  Log: $LOG_FILE"
    echo ""
    warn "PENDIENTE: configurar backup Restic->B2 manualmente (Paso 8) antes de producción real."
}

# ══════════════════════════════════════════════════════════════
# FLUJO PRINCIPAL
# ══════════════════════════════════════════════════════════════

main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "=== KEDAS v3.4.0 Instalación (kedas-core) — $(date) — Perfil: $PERFIL ===" > "$LOG_FILE"

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
    configurar_backup
    verificacion_final

    echo -e "${GREEN}${BOLD}Instalación KEDAS v3.4.0 completada.${NC}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
