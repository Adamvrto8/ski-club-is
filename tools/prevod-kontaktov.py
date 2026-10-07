"""
Prevod kontaktného hárku klubu (.xls) na CSV pre /import.

Spúšťaš ho ty, na svojom počítači. Skript nikdy nevypíše obsah buniek — na
konzolu ide len počet riadkov a počet chýbajúcich údajov, nie mená ani telefóny.

Použitie:
    pip install xlrd
    python tools/prevod-kontaktov.py "../tabuky/kontakty.xls" kontakty.csv
    python tools/prevod-kontaktov.py vstup.xls vystup.csv --druzstvo skola_lyzovania

Družstvo v hárku nie je, ale import ho vyžaduje. Buď ho doplň prepínačom
--druzstvo (rovnaké pre všetkých), alebo nechaj stĺpec prázdny a vyplň ho
v CSV ručne. Riadky bez družstva import preskočí.
"""

import argparse
import csv
import datetime
import sys

HEADERS = [
    "Priezvisko", "Meno", "Družstvo", "Narodený",
    "Otec - meno", "Telefón otec", "Mama - meno", "Telefón mama",
    "Adresa", "E-mail na oznamy",
]

TEAMS = ("skola_lyzovania", "sportove_druzstvo", "pretekove_druzstvo")

# Poradie stĺpcov v hárku, od nuly. Riadok 2 (index 2) je hlavička.
COL_NAME, COL_BIRTH = 1, 2
COL_FATHER, COL_FATHER_PHONE = 3, 4
COL_MOTHER, COL_MOTHER_PHONE = 5, 6
COL_ADDRESS, COL_EMAILS = 7, 8

EXCEL_EPOCH = datetime.date(1899, 12, 30)


def cell_text(value):
    """Excel drží čísla ako float, takže z telefónu spraví 915731317.0."""
    if value is None:
        return ""
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    return str(value).strip()


def cell_date(value):
    """Dátum narodenia je v hárku sériové číslo Excelu."""
    if isinstance(value, (int, float)) and value > 0:
        return (EXCEL_EPOCH + datetime.timedelta(days=int(value))).isoformat()
    return cell_text(value)


def split_name(full):
    """
    V hárku je meno v jednej bunke ako „Priezvisko Krstné“. Prvé slovo berieme
    ako priezvisko, zvyšok ako krstné meno. Dvojité priezviská si po prevode
    skontroluj v náhľade importu — tam sa to ešte dá opraviť.
    """
    parts = full.split()
    if len(parts) < 2:
        return full, ""
    return parts[0], " ".join(parts[1:])


def main():
    parser = argparse.ArgumentParser(description="Prevod kontaktných údajov z .xls na CSV pre import.")
    parser.add_argument("vstup", help="cesta k .xls s kontaktnými údajmi")
    parser.add_argument("vystup", help="kam zapísať CSV")
    parser.add_argument("--druzstvo", choices=TEAMS, default="", help="vyplní družstvo pre všetky riadky")
    parser.add_argument("--harok", default="", help="názov hárku, inak sa použije prvý")
    args = parser.parse_args()

    try:
        import xlrd
    except ImportError:
        sys.exit("Chýba knižnica xlrd. Nainštaluj ju príkazom: pip install xlrd")

    book = xlrd.open_workbook(args.vstup)
    sheet = book.sheet_by_name(args.harok) if args.harok else book.sheet_by_index(0)

    rows = []
    missing_name = missing_birth = missing_contact = 0

    # Riadok 0 je nadpis, riadok 1 prázdny, riadok 2 hlavička — dáta idú od riadku 3.
    for index in range(3, sheet.nrows):
        raw = [sheet.cell_value(index, col) if col < sheet.ncols else "" for col in range(9)]

        last_name, first_name = split_name(cell_text(raw[COL_NAME]))
        if not last_name:
            continue  # prázdny riadok na konci hárku
        if not first_name:
            missing_name += 1

        birth = cell_date(raw[COL_BIRTH])
        if not birth:
            missing_birth += 1

        father_phone = cell_text(raw[COL_FATHER_PHONE])
        mother_phone = cell_text(raw[COL_MOTHER_PHONE])
        emails = cell_text(raw[COL_EMAILS])
        if not emails and not father_phone and not mother_phone:
            missing_contact += 1

        rows.append([
            last_name, first_name, args.druzstvo, birth,
            cell_text(raw[COL_FATHER]), father_phone,
            cell_text(raw[COL_MOTHER]), mother_phone,
            cell_text(raw[COL_ADDRESS]), emails,
        ])

    # utf-8-sig, aby sa CSV dalo otvoriť aj v Exceli bez rozsypanej diakritiky.
    with open(args.vystup, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(HEADERS)
        writer.writerows(rows)

    print(f"Hotovo: {len(rows)} riadkov zapísaných do {args.vystup}")
    if missing_name:
        print(f"  {missing_name} riadkov má meno v jednej časti — skontroluj priezvisko/meno v náhľade importu")
    if missing_birth:
        print(f"  {missing_birth} riadkov nemá dátum narodenia — import ich preskočí")
    if missing_contact:
        print(f"  {missing_contact} riadkov nemá e-mail ani telefón")
    if not args.druzstvo:
        print("  Družstvo je prázdne — vyplň stĺpec 'Družstvo' v CSV, inak import preskočí všetky riadky.")
        print(f"  Povolené hodnoty: {', '.join(TEAMS)}")


if __name__ == "__main__":
    main()
