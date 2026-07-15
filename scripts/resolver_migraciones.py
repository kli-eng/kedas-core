#!/usr/bin/env python3
"""
INST-01b — Resolutor de dependencias de migraciones por módulo.

Uso:
    python3 resolver_migraciones.py --modulos MOD-02,MOD-04
    python3 resolver_migraciones.py --modulos MOD-03
    python3 resolver_migraciones.py --modulos MOD-03,MOD-06   # confirma que 022/024 no se duplican
    python3 resolver_migraciones.py --todos                   # instalación completa (Tier 3)

Devuelve la lista de archivos de migración en orden numérico correcto,
lista para que install.sh los aplique uno por uno con psql.
"""
import argparse
import json
import re
import sys

MANIFEST_PATH = "modulos_manifest.json"


def cargar_manifiesto():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def numero_migracion(nombre_archivo):
    """Extrae el número inicial para poder ordenar correctamente (004, 010b, 022...)."""
    m = re.match(r"^(\d+)([a-z]?)_", nombre_archivo)
    if not m:
        return (9999, "")
    return (int(m.group(1)), m.group(2))


def resolver(manifiesto, modulos_elegidos):
    errores = [m for m in modulos_elegidos if m not in manifiesto["modulos"]]
    if errores:
        print(f"❌ Módulo(s) no reconocido(s): {', '.join(errores)}", file=sys.stderr)
        print(f"   Módulos válidos: {', '.join(sorted(manifiesto['modulos'].keys()))}", file=sys.stderr)
        sys.exit(1)

    resultado = set(manifiesto["transversal"]["migraciones"])

    for mod in modulos_elegidos:
        info = manifiesto["modulos"][mod]
        resultado.update(info.get("migraciones_propias", []))
        resultado.update(info.get("migraciones_compartidas", []))

    return sorted(resultado, key=numero_migracion)


def main():
    parser = argparse.ArgumentParser(description="Resuelve qué migraciones aplicar según los módulos elegidos.")
    parser.add_argument("--modulos", type=str, help="Códigos de módulo separados por coma, ej: MOD-02,MOD-04")
    parser.add_argument("--todos", action="store_true", help="Instalación completa — todos los módulos")
    parser.add_argument("--formato", choices=["lista", "json"], default="lista")
    args = parser.parse_args()

    manifiesto = cargar_manifiesto()

    if args.todos:
        modulos_elegidos = list(manifiesto["modulos"].keys())
    elif args.modulos:
        modulos_elegidos = [m.strip().upper() for m in args.modulos.split(",")]
    else:
        print("❌ Debes especificar --modulos MOD-XX,MOD-YY o --todos", file=sys.stderr)
        sys.exit(1)

    migraciones = resolver(manifiesto, modulos_elegidos)

    nombres_modulos = [f"{m} ({manifiesto['modulos'][m]['nombre']})" for m in modulos_elegidos]
    print(f"# Módulos elegidos: {', '.join(nombres_modulos)}", file=sys.stderr)
    print(f"# Total migraciones a aplicar: {len(migraciones)}", file=sys.stderr)
    print("", file=sys.stderr)

    if args.formato == "json":
        print(json.dumps(migraciones, indent=2, ensure_ascii=False))
    else:
        for m in migraciones:
            print(m)


if __name__ == "__main__":
    main()
