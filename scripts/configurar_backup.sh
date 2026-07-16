#!/usr/bin/env bash
# ============================================================
# KEDAS v3.4.0 — Asistente de configuración de backup
# Archivo: scripts/configurar_backup.sh
# Restic + Backblaze B2 — mismo patrón verificado en producción real
# Uso: sudo bash scripts/configurar_backup.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

KEDAS_HOME="${KEDAS_HOME:-/opt/kedas}"
KEDAS_USER="${KEDAS_USER:-kedas-admin}"
ENV_FILE="${ENV_FILE:-/home/${KEDAS_USER}/.restic_env}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/home/${KEDAS_USER}/backup-kedas.sh}"

log()  { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }

mostrar_banner() {
cat << 'BANNER'
╔══════════════════════════════════════════════════════════╗
║   KEDAS — Configuración de Backup (Restic + Backblaze B2) ║
╚══════════════════════════════════════════════════════════╝
BANNER
    echo ""
}

verificar_root() {
    [[ $EUID -eq 0 ]] || { err "Este script debe ejecutarse como root o con sudo."; exit 1; }
}

instalar_restic() {
    info "Verificando Restic..."
    if command -v restic &>/dev/null; then
        log "Restic ya instalado: $(restic version | head -1)"
    else
        apt-get update -qq
        apt-get install -y -qq restic
        log "Restic instalado: $(restic version | head -1)"
    fi
}

explicar_backblaze() {
    echo ""
    echo -e "${BOLD}Este asistente configura backup automático usando Backblaze B2${NC}"
    echo "(almacenamiento externo cifrado, fuera de este servidor)."
    echo ""
    echo "Si aún no tienes una cuenta B2:"
    echo "  1. Crea una cuenta gratuita en https://www.backblaze.com/b2/sign-up.html"
    echo "     (el plan gratuito incluye 10GB — suficiente para empezar)"
    echo "  2. Crea un 'Bucket' privado (ej: kedas-backups-tuescuela)"
    echo "  3. Ve a 'App Keys' y genera una 'Application Key' con acceso a ese bucket"
    echo "  4. Anota el 'keyID' (esto es tu B2_ACCOUNT_ID) y la 'applicationKey'"
    echo "     (esto es tu B2_ACCOUNT_KEY) — la applicationKey solo se muestra una vez"
    echo ""
    read -rp "Presiona Enter cuando tengas estos datos a mano..."
}

pedir_credenciales() {
    echo ""
    read -rp "B2_ACCOUNT_ID (keyID): " B2_ACCOUNT_ID
    read -rsp "B2_ACCOUNT_KEY (applicationKey — no se mostrará al escribir): " B2_ACCOUNT_KEY
    echo ""
    read -rp "Nombre del bucket B2 (ej: kedas-backups-tuescuela): " B2_BUCKET

    if [[ -z "$B2_ACCOUNT_ID" || -z "$B2_ACCOUNT_KEY" || -z "$B2_BUCKET" ]]; then
        err "Todos los campos son obligatorios."
        exit 1
    fi

    RESTIC_PASSWORD=$(openssl rand -base64 24)
    warn "Se generó una clave de cifrado del repositorio Restic:"
    echo ""
    echo -e "  ${BOLD}${RESTIC_PASSWORD}${NC}"
    echo ""
    warn "GUARDA ESTA CLAVE en un lugar físico seguro (papel, caja fuerte del colegio,"
    warn "gestor de contraseñas). Sin ella, NO es posible restaurar ningún backup —"
    warn "ni siquiera KLI puede recuperarla si se pierde."
    echo ""
    read -rp "Presiona Enter para confirmar que guardaste la clave..."
}

escribir_env_file() {
    info "Escribiendo $ENV_FILE ..."
    cat > "$ENV_FILE" << EOF
export B2_ACCOUNT_ID=${B2_ACCOUNT_ID}
export B2_ACCOUNT_KEY=${B2_ACCOUNT_KEY}
export RESTIC_REPOSITORY=b2:${B2_BUCKET}:kedas
export RESTIC_PASSWORD=${RESTIC_PASSWORD}
EOF
    chmod 600 "$ENV_FILE"
    chown "$KEDAS_USER:$KEDAS_USER" "$ENV_FILE"
    log "$ENV_FILE creado (permisos 600, solo lectura del propietario)."
}

inicializar_repositorio() {
    info "Inicializando repositorio Restic en B2 (si no existe aún)..."
    source "$ENV_FILE"
    if restic snapshots &>/dev/null; then
        log "El repositorio ya existía e inicializado — se reutiliza."
    else
        restic init
        log "Repositorio Restic inicializado en b2:${B2_BUCKET}:kedas"
    fi
}

crear_script_backup() {
    info "Creando $BACKUP_SCRIPT ..."
    cat > "$BACKUP_SCRIPT" << EOF
#!/bin/bash
# KEDAS — Backup diario (generado por configurar_backup.sh)
source "${ENV_FILE}"

# Backup de la base de datos
docker exec kedas-postgres pg_dump -U kedas kedas_db | \\
  restic backup --stdin --stdin-filename kedas_db.sql

# Backup de los archivos del proyecto (código, configuración)
restic backup "${KEDAS_HOME}/kedas" \\
  --exclude="${KEDAS_HOME}/kedas/.git" \\
  --exclude="${KEDAS_HOME}/kedas/__pycache__" \\
  --exclude="${KEDAS_HOME}/kedas/frontend/node_modules" \\
  --exclude="${KEDAS_HOME}/kedas/frontend/dist"

# Retención: 7 diarios, 4 semanales, 3 mensuales — separado por path
restic forget --path /kedas_db.sql --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune
restic forget --path "${KEDAS_HOME}/kedas" --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune

echo "Backup completado: \$(date)"
EOF
    chmod +x "$BACKUP_SCRIPT"
    chown "$KEDAS_USER:$KEDAS_USER" "$BACKUP_SCRIPT"
    log "$BACKUP_SCRIPT creado y ejecutable."
}

probar_backup() {
    echo ""
    read -rp "¿Ejecutar un backup de prueba ahora para confirmar que todo funciona? (s/N): " PROBAR
    if [[ "${PROBAR,,}" == "s" ]]; then
        info "Ejecutando backup de prueba (puede tardar unos minutos)..."
        if bash "$BACKUP_SCRIPT"; then
            log "Backup de prueba exitoso."
        else
            err "El backup de prueba falló — revisa las credenciales B2 e intenta de nuevo."
            exit 1
        fi
    else
        warn "Backup de prueba omitido — recomendamos correrlo manualmente antes de confiar en el cron:"
        warn "  sudo bash $BACKUP_SCRIPT"
    fi
}

configurar_cron() {
    echo ""
    read -rp "¿Configurar backup automático diario a las 03:00? (S/n): " CONFIRMAR_CRON
    if [[ "${CONFIRMAR_CRON,,}" != "n" ]]; then
        CRON_FILE="/etc/cron.d/kedas-backup"
        cat > "$CRON_FILE" << EOF
# KEDAS — Backup automático diario (generado por configurar_backup.sh)
0 3 * * * ${KEDAS_USER} bash ${BACKUP_SCRIPT} >> /var/log/kedas_backup.log 2>&1
EOF
        chmod 644 "$CRON_FILE"
        log "Cron configurado: backup diario a las 03:00. Log en /var/log/kedas_backup.log"
        CRON_CONFIGURADO=true
    else
        warn "Cron no configurado — recuerda programar el backup por tu cuenta."
        CRON_CONFIGURADO=false
    fi
}

resumen_final() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  BACKUP CONFIGURADO${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo "  Credenciales:      $ENV_FILE (permisos 600)"
    echo "  Script de backup:  $BACKUP_SCRIPT"
    echo "  Repositorio B2:    b2:${B2_BUCKET}:kedas"
    if [[ "${CRON_CONFIGURADO:-false}" == "true" ]]; then
        echo "  Cron:              /etc/cron.d/kedas-backup (03:00 diario)"
    else
        echo "  Cron:              NO configurado — programar manualmente"
    fi
    echo ""
    warn "RECORDATORIO: la clave RESTIC_PASSWORD generada antes NO queda"
    warn "guardada en ningún otro lugar más que $ENV_FILE. Haz una copia"
    warn "física de esa clave por separado — es la única forma de restaurar"
    warn "un backup si este servidor se pierde por completo."
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
}

main() {
    mostrar_banner
    verificar_root
    instalar_restic
    explicar_backblaze
    pedir_credenciales
    escribir_env_file
    inicializar_repositorio
    crear_script_backup
    probar_backup
    configurar_cron
    resumen_final
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
