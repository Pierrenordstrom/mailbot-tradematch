# TradeMatch Mailbot – plan

Mål: boka fler demomöten med begagnathandlare genom personliga mail från
`pierre@tradematch.com`. Mailen ska se handskrivna ut, öppningar ska spåras och
den som inte svarar ska få en automatisk uppföljning efter 5 dagar.

---

## 1. Vad listan innehåller

Källa: `begagnathandlare_top_700__2026-09-20.xlsx` (bladen *Topp 500*, *Reserver*, *Info*).

| | Antal |
|---|---|
| Unika bolag (efter att dubbletter på orgnr slagits ihop, 154 finns i båda bladen) | **1 114** |
| Bolag med e-postadress | **437** (434 unika adresser) |
| – varav ★ Extra prioriterad (stark verkstadsindikation) | 106 |
| – varav VD-namn finns (personligt tilltal möjligt) | 107 |
| – varav personliga adresser (`fornamn@…`) i stället för `info@` | ~163 |
| – varav freemail (telia.com, gmail.com m.fl.) | ~87 |
| Bolag **utan** e-post men med telefon | **671** |

Fält vi kan använda i mailen: `Namn`, `Ort`, `Län`, `Bilar på Blocket`,
`Anläggningar`, `VD`, `Hemsida`, `Blocket-butik`, `Omsättning`, `Anställda`,
`Verkstad (register/namn)`, `Prioritet`.

Slutsats: e-post når ~40 % av listan. Resten (671 bolag) blir en ringlista –
se punkt 7.

---

## 2. Viktig teknisk begränsning – och rekommenderad lösning

Gmail-kopplingen jag har kan skapa utkast och skicka mail, men **Gmail API har
ingen "schemalägg utskick"-funktion** och ingen öppningsspårning. Utkast som
jag skapar går alltså inte att tidsinställa via API:t – det måste lösas med en
motor som skickar vid rätt tidpunkt.

### Rekommendation: Google Apps Script i ditt eget Workspace-konto

Allt körs i ditt eget Google-konto, mailen skickas från din riktiga brevlåda
och hamnar i Skickat precis som om du skrivit dem själv.

```
Google Sheet "Kampanj"  ──►  Apps Script (tidsstyrd, var 7–15 min)
  en rad per mottagare           │ skickar nästa mail via GmailApp
  status, datum, tråd-id         │ loggar tråd-id + tid
                                 ▼
                           Gmail (pierre@tradematch.com)
                                 │
   Spårningspixel ◄──────────────┘ (Apps Script Web App-URL i mailet)
   Klickspårning  ◄── bokningslänk går via redirect som loggar klick
   Svarskoll      ◄── skriptet läser tråden: har kunden svarat?
   Uppföljning    ──► svar i SAMMA tråd efter 5 arbetsdagar om inget svar
```

Varför detta i stället för Resend/Mailchimp m.fl.:
- Mailet kommer från riktiga Gmail-servrar → ser personligt ut, bäst leverans.
- Svar hamnar direkt i din inkorg, uppföljningen hamnar i samma tråd.
- Ingen extra kostnad, ingen ny infrastruktur. Workspace-gräns: 2 000 mail/dygn.

Alternativ (om du inte vill köra Apps Script): Claude skapar utkasten i Gmail
och en schemalagd Claude-rutin skickar dem i jämn takt, med spårning via en
liten endpoint på Vercel + tabell i Supabase. Fungerar, men fler rörliga delar.

---

## 3. Utskickstakt (för att undvika spamfilter)

Att skicka 437 kallmail från en brevlåda som normalt skickar ~5–10 mail/dag är
den största risken i hela projektet. Plan:

| Vecka | Mail/dag (nya) | Kommentar |
|---|---|---|
| 1 | 15–20 | Börja med ★-prioriterade + personliga adresser |
| 2 | 25–30 | Om studs < 3 % och inga spamklagomål |
| 3+ | 35–40 | Tak. Uppföljningar räknas in i taket |

- Endast vardagar, **tis–tors 07:30–10:30 och 13:00–15:30** (handlare läser
  mail tidigt och efter lunch). Måndag lätt, fredag eftermiddag aldrig.
- Slumpat intervall 7–15 min mellan mail, aldrig exakt samma tid.
- Totalt tar hela listan ca 3–4 veckor inkl. uppföljningar.
- **Före start:** kontrollera SPF, DKIM och DMARC för `tradematch.com`
  (Google Admin → Gmail → Autentisera e-post). Utan DKIM hamnar mycket i skräp.
- Verifiera adresserna innan utskick (syntax + MX-uppslag), så studsar hålls nere.
- Automatisk broms: skriptet pausar kampanjen om studsfrekvensen passerar 5 %.

---

## 4. Mailets utformning – "handskrivet"

Det som får ett mail att se handskrivet ut är att det **inte** ser ut som ett
nyhetsbrev:

- Ren text eller minimal HTML, ingen logga, inga knappar, inga bilder utöver
  signaturen.
- Kort: 60–110 ord. En fråga, en tydlig nästa-steg.
- Samma ton som dina vanliga mail ("Tjenare Jerry," / "Hejsan,").
- Din riktiga Gmail-signatur (Pierre Nordström, Co-Founder & CEO, mobil,
  adress). Vill du ha en **inskannad handskriven namnteckning** lägger vi den som
  en liten PNG (hostad på tradematch.com) ovanför textsignaturen.
- Ämnesrad i gemener, kort, som ett internt mail: `fråga om {Namn}`,
  `{Ort} + TradeMatch`, `era {Bilar} bilar på Blocket`.
- Ingen avregistreringslänk i sidfot (ser massutskick ut) – i stället en rad:
  *"Är det fel person eller inte aktuellt, svara bara 'nej tack' så hör jag
  inte av mig igen."* Svaret fångas automatiskt och adressen spärras.

### Personalisering (variabler från listan)

| Variabel | Exempel | Används till |
|---|---|---|
| `{Förnamn}` | Jerry (från `VD`, format "Efternamn, Förnamn …") | Hälsning; saknas → "Hejsan," |
| `{Namn}` | Carlqvist Bil | Ämne + brödtext (AB/Aktiebolag tas bort) |
| `{Ort}` | Tingsryd | "…flera handlare i Kronoberg…" |
| `{Bilar}` | 486 | "Såg att ni har 486 bilar ute på Blocket…" |
| `{Verkstad}` | Ja | Eget stycke om verkstadsflödet för ★-bolag |
| `{Anläggningar}` | 3 | "…med tre anläggningar blir det extra viktigt…" |

### Utkast mail 1 (att finjustera tillsammans)

> **Ämne:** era 486 bilar på blocket
>
> Tjenare Jerry,
>
> Såg att ni har 486 bilar ute på Blocket just nu – imponerande lager för
> Tingsryd!
>
> Jag är en av grundarna till TradeMatch, ett affärssystem byggt för
> begagnathandlare där hela affären hanteras på ett ställe: inbyte, finansiering,
> garanti och avtal. {Om verkstad: Eftersom ni även har verkstad kan ni koppla
> ihop reparationer och ställkostnader direkt mot bilen.}
>
> Handlare som bytt till oss sparar mest tid på pappersarbetet runt varje affär.
>
> Har du 20 minuter nästa vecka så visar jag hur det skulle se ut för er?
> Välj en tid här: {bokningslänk} – eller svara bara med en dag som passar.
>
> Är det fel person eller inte aktuellt, svara "nej tack" så hör jag inte av mig igen.
>
> *[handskriven namnteckning]*
> Pierre Nordström
> Co-Founder & CEO · 070-712 82 22 · TradeMatch Sverige AB

### Uppföljning (dag 5, i samma tråd, bara om inget svar)

> Hej igen Jerry,
>
> Ville bara lyfta det här ifall det försvann i inkorgen. Passar det med en
> kort genomgång tisdag eller torsdag förmiddag?
>
> /Pierre

---

## 5. Sekvens och logik

```
Dag 0   Mail 1 skickas
Dag 5   (arbetsdagar) inget svar → Uppföljning 1 i samma tråd
Dag 12  inget svar → Uppföljning 2 "break-up": "Ska jag stänga ärendet?"
        (valfritt – ger ofta flest svar av alla steg)
```

Sekvensen **stoppas direkt** för en mottagare om något av detta inträffar:
- Svar i tråden (vilket svar som helst, även från kollega)
- Studs / "adressen finns inte"
- Autosvar semester → uppföljningen skjuts till returdatum om det kan läsas ut
- "nej tack", "avregistrera", "inte intresserad" → spärrlista, aldrig mer mail
- Mötet bokat via bokningslänken

---

## 6. Spårning och dashboard

Per mottagare i Google Sheet: `skickad`, `öppnad (antal, första/senaste)`,
`klickat bokningslänk`, `svarat`, `svarstyp`, `möte bokat`, `studs`, `spärrad`.

Ärligt om öppningsspårning:
- Apple Mail (iPhone) förladdar bilder → många falska "öppnat".
- Outlook blockerar ofta bilder → många missade öppningar.
- En spårningspixel ökar risken något för spamklassning.

Därför: öppningar används som **signal för prioritering**, inte som sanning.
De viktiga måtten är **klick på bokningslänken, svar och bokade möten**.
Förslag: pixel på i mail 1, av i uppföljningarna.

En enkel dashboard (Sheet-flik eller webbsida) visar:
skickat / öppnat / klickat / svarat / bokat, per dag och per segment
(★ vs standard, med/utan verkstad, storlek på Blocket-lager).

---

## 7. Smarta tillägg för fler bokade möten

1. **Het-lista för telefon varje morgon.** Alla som öppnat 2+ gånger eller
   klickat men inte bokat hamnar överst på en ringlista (vi har telefonnummer
   till alla). Ett samtal inom 24 h efter öppning konverterar långt bättre än
   ett mail till.
2. **Ringlista för de 671 bolag som saknar e-post.** Sorterad på prioritet och
   Blocket-lager, med samma pitch i kortversion. Alternativt: hämta e-post från
   deras hemsidor (skriptet `skanna_verkstad.py` kan byggas ut) för att öka
   täckningen.
3. **Bokningslänk med förvalda tider** (Google Kalender bokningssidor eller
   Calendly) – "välj en tid" ger fler möten än "hör av dig".
4. **Segmenterade budskap:** ★ med verkstad får verkstadsvinkel; stora lager
   (100+ bilar) får tidsbesparing/volym; flera anläggningar får "samlad bild
   över alla anläggningar"; små handlare får enkelhet och pris.
5. **A/B-testa ämnesrader** i vecka 1–2 (två varianter), behåll vinnaren.
6. **Social proof:** nämn en befintlig kund i samma region om de godkänner det
   ("{Kund} i {Ort} kör redan TradeMatch") – mycket starkt i bilbranschen
   där alla känner alla.
7. **AI-klassning av svar:** Claude läser inkomna svar varje morgon och sorterar
   dem i *intresserad / fråga / inte nu (återkom om X mån) / nej / fel person
   (ny kontakt angiven)* och föreslår ett svarsutkast i Gmail som du bara
   granskar och skickar. "Fel person, prata med Anna" → ny kontakt läggs till
   automatiskt.
8. **Återkoppla "inte nu"** automatiskt efter 3 månader.
9. **Veckorapport** till dig (och Sebastian/Erik) varje fredag: statistik +
   vilka möten som bokats.
10. **Blocket-krok:** kolla deras Blocket-butik innan mailet och nämn något
    konkret (t.ex. snittålder på bilarna eller att de säljer mycket X-märke).

---

## 8. Juridik (kort)

- B2B-mail till juridiska personer (AB) är tillåtet utan förhandssamtycke enligt
  marknadsföringslagen, men **enskilda firmor räknas som fysiska personer** och
  kräver samtycke. I den här listan har alla 437 bolag med e-post orgnr (433 AB, 4 handelsbolag), så där finns inga enskilda firmor. Skriptet filtrerar ändå bort personnummer i framtida listor.
- Personliga adresser (`roger.persson@…`) och VD-namn är personuppgifter enligt
  GDPR. Grund: berättigat intresse. Krav: enkel möjlighet att avböja (raden
  "svara nej tack"), spärrlista som respekteras, och en kort rad om var
  integritetspolicyn finns (kan ligga i signaturen).
- Kontaktlistan committas **inte** till Git-repot (se `.gitignore`).

---

## 9. Genomförande – steg för steg

| # | Steg | Vem |
|---|---|---|
| 1 | Beslut på öppna frågor (nedan) | Pierre |
| 2 | Kontroll av SPF/DKIM/DMARC på tradematch.com | Pierre (Google Admin) / Claude guidar |
| 3 | Rensa och berika listan → Google Sheet "Kampanj" (dubbletter, enskilda firmor, förnamn ur VD, adressvalidering) | Claude |
| 4 | Skriva Apps Script: utskick, pixel, klick-redirect, svarskoll, uppföljning, spärrlista, broms | Claude |
| 5 | Slutlig mailtext + 2 ämnesvarianter + uppföljningar | Claude + Pierre |
| 6 | Testutskick till 3–5 egna adresser (Gmail, Outlook, iPhone) – kolla att det hamnar i inkorgen och ser handskrivet ut | Claude + Pierre |
| 7 | **De första 20 mailen som utkast i Gmail** för manuell granskning innan automatiken slås på | Claude |
| 8 | Start vecka 1 (15–20/dag), daglig kontroll av studs/svar | Automatiskt |
| 9 | Morgonrutin: het-lista + svarsklassning + svarsutkast | Claude (schemalagd) |

---

## 10. Öppna frågor till dig

1. **Vad är den viktigaste vinsten för en begagnathandlare med TradeMatch?**
   (1–3 konkreta siffror/påståenden du vill att mailet lyfter.)
2. **Handskriven namnteckning:** har du en inskannad signatur (PNG), eller ska
   "handskrivet" betyda att mailet ser personligt skrivet ut med din vanliga
   textsignatur?
3. **Bokningslänk:** Google Kalender-bokningssida, Calendly eller annat? Hur
   långa möten, vilka tider?
4. **Kunder som referens:** får vi nämna befintliga kunder vid namn?
5. **Motor:** OK med Google Apps Script i ditt konto (rekommenderat)?
6. **Omfattning:** alla 437 med e-post, eller börja med ★ + Topp 500?
7. **Uppföljning 2 (dag 12):** ja eller nej?

---

## 11. Beslut (från formuläret 2026-09-28)

| Fråga | Beslut |
|---|---|
| Motor | Google Apps Script i Pierres konto |
| Omfattning | Alla 437, ★ först |
| Start | tisdag 2026-10-06 |
| Tak | 40 nya mail/dag (upptrappning 15 → 40 första veckorna) |
| Öppningsspårning | Bara i mail 1 |
| Uppföljning 2 (dag 12) | Ja |
| Signatur | Textsignatur, ingen inskannad namnteckning |
| Bokningslänk | Ingen, kunden svarar med tid / rätt person |
| Möte | 20 min, Teams / Google Meet |
| Referenskunder | Får nämnas: Moderna Bil, HRM Motor, BD Bil |
| Fördelar | Mobilanpassat · Allt i ett system · Verkstad- och logistiksystem kopplat till försäljningen |
| Rapporter och het-lista | pierre@tradematch.com |
| Öppet | Anpassad verkstadsrad |
