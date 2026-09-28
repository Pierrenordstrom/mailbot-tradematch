"""Bygger kampanjlistan (CSV) ur handlarlistan.

Användning:
    python scripts/build_campaign.py <handlare.xlsx> [utkatalog]

Skriver kampanj.csv (bolag med e-post) och ringlista.csv (bolag utan e-post).
Utdata innehåller personuppgifter och hamnar i data/, som inte committas.
"""
import csv
import re
import sys
from pathlib import Path

import pandas as pd

KOLUMNER = [
    "ID", "Grupp", "Bolag", "Ort", "Län", "Bilar på Blocket", "Verkstad", "E-post",
    "Telefon", "VD", "Status", "Mail 1 skickat", "Uppföljning 1 skickat",
    "Uppföljning 2 skickat", "Öppningar", "Första öppning", "Senaste öppning",
    "Svarat", "Anteckning", "Tråd-ID", "Message-ID",
]


def rent_bolagsnamn(namn: str) -> str:
    namn = re.sub(r"\s+", " ", str(namn)).strip()
    namn = re.sub(r"\s*\(publ\)\s*$", "", namn, flags=re.I)
    namn = re.sub(r"[\s,]+(AB|Aktiebolag)\.?$", "", namn, flags=re.I)
    namn = re.sub(r"^Aktiebolaget\s+", "", namn, flags=re.I)
    if namn.isupper():
        namn = " ".join(w if len(w) <= 3 else w.capitalize() for w in namn.split())
    return namn.strip(" -")


def telefon(v) -> str:
    """+46 47745250 – mellanslaget gör att Sheets behåller värdet som text."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    v = str(int(v)) if isinstance(v, (int, float)) else re.sub(r"\D", "", str(v))
    if v.startswith("46"):
        v = v[2:]
    return f"+46 {v.lstrip('0')}" if v else ""


def main(src: str, outdir: str = "data") -> None:
    blad = pd.read_excel(src, sheet_name=None)
    df = pd.concat([blad["Topp 500"], blad["Reserver"]], ignore_index=True)
    df = df.dropna(subset=["Namn"]).drop_duplicates("Orgnr")

    df["stjarna"] = df["Prioritet"].astype(str).str.startswith("★")
    df["bilar"] = df["Bilar på Blocket"].fillna(0).astype(int)
    df["oms"] = df["Omsättning (tkr)"].fillna(0)
    df = df.sort_values(["stjarna", "bilar", "oms"], ascending=[False, False, False])

    med = df[df["E-post"].notna()].copy()
    med["epost"] = med["E-post"].str.strip().str.lower()
    med = med.drop_duplicates("epost")
    utan = df[df["E-post"].isna()]

    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)

    with open(out / "kampanj.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(KOLUMNER)
        for i, (_, r) in enumerate(med.iterrows(), 1):
            tel = telefon(r["Telefon"])
            w.writerow([
                f"TM{i:03d}",
                "★" if r["stjarna"] else "Standard",
                rent_bolagsnamn(r["Namn"]),
                r["Ort"] if isinstance(r["Ort"], str) else "",
                r["Län"] if isinstance(r["Län"], str) else "",
                r["bilar"],
                "Ja" if r["Verkstad (register/namn)"] == "Ja – stark indikation" else "Nej",
                r["epost"],
                tel,
                r["VD"] if isinstance(r["VD"], str) else "",
                "Väntar",
            ])  # övriga kolumner fylls av skriptet

    with open(out / "ringlista.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Grupp", "Bolag", "Ort", "Län", "Bilar på Blocket", "Telefon", "VD", "Hemsida", "Orgnr", "Ringt", "Resultat"])
        for _, r in utan.iterrows():
            tel = telefon(r["Telefon"])
            w.writerow([
                "★" if r["stjarna"] else "Standard", rent_bolagsnamn(r["Namn"]),
                r["Ort"] if isinstance(r["Ort"], str) else "", r["Län"] if isinstance(r["Län"], str) else "",
                r["bilar"], tel, r["VD"] if isinstance(r["VD"], str) else "",
                r["Hemsida"] if isinstance(r["Hemsida"], str) else "", r["Orgnr"], "", "",
            ])

    print(f"kampanj: {len(med)} rader, ringlista: {len(utan)} rader -> {out}/")


if __name__ == "__main__":
    main(*sys.argv[1:])
