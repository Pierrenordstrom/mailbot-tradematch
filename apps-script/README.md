# Installera mailboten (ca 10 minuter)

Mailboten är ett Google Apps Script som sitter i kampanjarket och skickar från
din egen Gmail. Den skickar i jämn takt inom tidsfönstren, följer upp i samma
tråd, stoppar vid svar och studsar, och mailar dig en het-lista kl 07 varje morgon.

## 1. Lägg in skriptet

1. Öppna kampanjarket **TradeMatch mailbot – kampanj** i Google Drive.
2. **Tillägg → Apps Script**.
3. Radera allt i `Code.gs` och klistra in innehållet från [`Code.gs`](Code.gs).
4. Klicka på kugghjulet **Projektinställningar** och bocka i
   **Visa manifestfilen "appsscript.json" i redigeraren**. Öppna
   `appsscript.json` och ersätt innehållet med [`appsscript.json`](appsscript.json).
5. Spara (Ctrl/Cmd + S).

## 2. Installera

1. Ladda om kampanjarket. Menyn **Mailbot** dyker upp.
2. **Mailbot → 1. Installera**. Godkänn behörigheterna. Du ser en varning om att
   appen inte är verifierad: klicka **Avancerat → Gå till … (osäkert)**. Det är
   ditt eget skript.
3. Installationen:
   - skapar flikarna **Inställningar**, **Mallar** och **Logg**
   - lägger in tidsstyrningen (var 5:e minut, svarskoll var 30:e minut,
     het-lista kl 07)
   - går igenom din Gmail och sätter **Hoppa över** på bolag du redan har
     mailat med, så att de inte får ett kallmail.

## 3. Öppningsspårning

1. I Apps Script: **Driftsätt → Ny driftsättning → Typ: Webbapp**.
2. Kör som: **Jag**. Åtkomst: **Alla**. Klicka **Driftsätt** och kopiera URL:en.
3. Klistra in URL:en i **Inställningar → Spårnings-URL**.

Om **Alla** inte går att välja har Workspace-administratören spärrat det. Lämna
då Spårnings-URL tom: allt annat fungerar, men öppningar spåras inte.

## 4. Testa och starta

1. **Mailbot → 2. Skicka testmail till mig**. Du får två testmail (ett med och
   ett utan verkstadsrad). Kolla att de hamnar i inkorgen och att signaturen ser
   rätt ut.
2. Gå igenom raderna som fått **Hoppa över**. Ändra till **Väntar** om ett bolag
   ändå ska få mail.
3. **Mailbot → Starta kampanjen**. Utskicken börjar på startdatumet i
   Inställningar (tisdag 6 oktober) kl 07:30.

## Daglig användning

- **Pausa:** Mailbot → Pausa kampanjen, eller sätt *Kampanj aktiv* till NEJ.
- **Ändra text:** redigera fliken Mallar. Ändringen gäller från nästa mail.
- **Stoppa ett bolag:** sätt Status till *Hoppa över*.
- **Svar:** hamnar i din inkorg som vanligt. Skriptet sätter Status till
  *Svarat* eller *Nej tack*, och inga fler uppföljningar skickas.
- **Studsbroms:** om fler än 5 % av mailen studsar pausas kampanjen och du får ett mail.

## Statusar

| Status | Betyder |
|---|---|
| Väntar | I kön för mail 1 |
| Skickat | Mail 1 skickat, väntar på svar |
| Uppföljning 1 / 2 | Uppföljningen skickad i samma tråd |
| Svarat | Kunden har svarat, sekvensen är stoppad |
| Nej tack | Kunden har tackat nej, får aldrig mer mail |
| Studs | Adressen fungerar inte |
| Klar – inget svar | Hela sekvensen är skickad utan svar |
| Hoppa över | Skickas inte (befintlig kontakt eller manuellt stoppad) |
| Fel | Något gick fel, se Anteckning och fliken Logg |
