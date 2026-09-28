/**
 * TradeMatch Mailbot – Google Apps Script bundet till kampanjarket.
 *
 * Skickar personliga mail från användarens egen Gmail i jämn takt,
 * följer upp i samma tråd, stoppar vid svar/studs och skickar en daglig
 * het-lista. Allt styrs från flikarna Kampanj, Inställningar och Mallar.
 */

const FLIK_KAMPANJ = 'Kampanj';
const FLIK_INST = 'Inställningar';
const FLIK_MALLAR = 'Mallar';
const FLIK_LOGG = 'Logg';

const STATUS = {
  VANTAR: 'Väntar',
  SKICKAT: 'Skickat',
  UPPF1: 'Uppföljning 1',
  UPPF2: 'Uppföljning 2',
  SVARAT: 'Svarat',
  NEJ: 'Nej tack',
  STUDS: 'Studs',
  KLAR: 'Klar – inget svar',
  HOPPA: 'Hoppa över',
  FEL: 'Fel',
};
const AKTIVA = [STATUS.SKICKAT, STATUS.UPPF1, STATUS.UPPF2];
// Klar-trådar kollas också, så att sena svar registreras.
const KOLLA_SVAR = AKTIVA.concat([STATUS.KLAR]);

const STANDARD_INST = [
  ['Kampanj aktiv', 'NEJ', 'JA = skriptet skickar. NEJ = pausat. Studsbromsen sätter NEJ automatiskt.'],
  ['Startdatum', '2026-10-06', 'Första dagen något skickas (ÅÅÅÅ-MM-DD).'],
  ['Mail per dag vecka 1', 20, 'Tak inklusive uppföljningar.'],
  ['Mail per dag vecka 2', 30, ''],
  ['Mail per dag därefter', 40, 'Håll under 50 för en vanlig brevlåda.'],
  ['Sändningsdagar', '1,2,3,4,5', '1 = måndag … 5 = fredag.'],
  ['Tidsfönster', '07:30-10:30,13:00-15:30', 'Svensk tid. Kommaseparerade fönster.'],
  ['Uppföljning 1 efter arbetsdagar', 5, 'Räknat från mail 1.'],
  ['Uppföljning 2 aktiv', 'JA', ''],
  ['Uppföljning 2 efter arbetsdagar', 5, 'Räknat från uppföljning 1.'],
  ['Möteslängd', '20 min', 'Används i {möteslängd}.'],
  ['Avsändarnamn', 'Pierre Nordström', ''],
  ['Rapport till', 'pierre@tradematch.com', 'Daglig het-lista och larm.'],
  ['Spårnings-URL', '', 'Web app-URL från Driftsätt → Ny driftsättning. Tom = ingen öppningsspårning.'],
  ['Max studs %', 5, 'Pausar kampanjen om andelen studsar blir högre (efter minst 20 skickade).'],
];

const STANDARD_MALLAR = [
  ['Ämne', 'Fråga om {bolag}'],
  ['Mail 1', [
    'Hejsan,',
    '',
    '{öppning}',
    '',
    'Vet inte om det här är rätt väg, men ni kanske kan hjälpa mig komma i kontakt med rätt person.',
    '',
    'Jag är en av grundarna till TradeMatch, som inte bara hanterar det självklara i ett affärssystem, som avtal, kunder och lager, utan alla processer i verksamheten. Ni ser var alla era fordon befinner sig, vad som behöver åtgärdas innan försäljning och får ner era ledtider. {verkstadsrad}',
    '',
    'Flera stora handlare, bland annat HRM Motor, Moderna Bil och Motorhuset, använder redan TradeMatch.',
    '',
    'Vem är rätt person att visa detta för hos er i ett kort möte på {möteslängd}?',
  ].join('\n')],
  ['Öppning 5+ bilar', 'Hittade er på Blocket och gillar verkligen ert lager!'],
  ['Öppning färre bilar', 'Hittade er när jag kollade på begagnathandlare i {ort} och gillar verkligen det ni gör!'],
  ['Verkstadsrad', 'Med vår verkstadsmodul får ni in all verkstadshantering på era interna fordon, och allt kopplas till ett och samma bokföringssystem.'],
  ['Uppföljning 1', [
    'Hej igen,',
    '',
    'Ville bara lyfta det här ifall det försvann i inkorgen. Vem hos er är rätt person att prata med, eller passar det med en kort genomgång tisdag eller torsdag förmiddag?',
    '',
    '/Pierre',
  ].join('\n')],
  ['Uppföljning 2', [
    'Hejsan,',
    '',
    'Jag har hört av mig innan om TradeMatch men inte fått något svar, så jag antar att det inte är rätt läge just nu.',
    '',
    'Ska jag stänga ärendet, eller är det bättre att jag hör av mig igen om några månader?',
    '',
    '/Pierre',
  ].join('\n')],
];

const NEJ_REGEX = /\b(nej tack|inte intresserad|ej intresserad|avregistrera|avsluta|sluta skicka|ta bort (mig|oss)|unsubscribe|inget intresse)\b/i;
const AUTOSVAR_REGEX = /(autosvar|automatiskt svar|automatic reply|auto.?reply|out of (the )?office|frånvaro|semester|ledig|vacation)/i;
const STUDS_FRAN_REGEX = /(mailer-daemon|postmaster|mail delivery)/i;

// ---------------------------------------------------------------- Meny

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Mailbot')
    .addItem('1. Installera (flikar, triggers, kolla befintliga kontakter)', 'installera')
    .addItem('2. Skicka testmail till mig', 'skickaTest')
    .addSeparator()
    .addItem('Starta kampanjen', 'starta')
    .addItem('Pausa kampanjen', 'pausa')
    .addSeparator()
    .addItem('Kolla svar och studsar nu', 'kollaSvar')
    .addItem('Skicka dagens het-lista nu', 'dagligRapport')
    .addToUi();
}

function installera() {
  const ss = SpreadsheetApp.getActive();
  const kampanj = ss.getSheets()[0];
  if (kampanj.getName() !== FLIK_KAMPANJ) kampanj.setName(FLIK_KAMPANJ);
  kampanj.setFrozenRows(1);
  kampanj.getRange(1, 1, 1, kampanj.getLastColumn()).setFontWeight('bold');

  let inst = ss.getSheetByName(FLIK_INST);
  if (!inst) {
    inst = ss.insertSheet(FLIK_INST);
    inst.getRange(1, 1, 1, 3).setValues([['Inställning', 'Värde', 'Förklaring']]).setFontWeight('bold');
    inst.getRange(2, 1, STANDARD_INST.length, 3).setValues(STANDARD_INST);
    inst.getRange(2, 2, STANDARD_INST.length, 1).setNumberFormat('@').setBackground('#fff8e1');
    inst.setColumnWidth(1, 240); inst.setColumnWidth(2, 260); inst.setColumnWidth(3, 480);
  }
  let mallar = ss.getSheetByName(FLIK_MALLAR);
  if (!mallar) {
    mallar = ss.insertSheet(FLIK_MALLAR);
    mallar.getRange(1, 1, 1, 2).setValues([['Mall', 'Text (variabler: {bolag} {ort} {län} {öppning} {verkstadsrad} {möteslängd})']]).setFontWeight('bold');
    mallar.getRange(2, 1, STANDARD_MALLAR.length, 2).setValues(STANDARD_MALLAR).setWrap(true).setVerticalAlignment('top');
    mallar.setColumnWidth(1, 180); mallar.setColumnWidth(2, 720);
  }
  let logg = ss.getSheetByName(FLIK_LOGG);
  if (!logg) {
    logg = ss.insertSheet(FLIK_LOGG);
    logg.appendRow(['Tid', 'ID', 'Händelse', 'Detalj']);
    logg.setFrozenRows(1);
    logg.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('kollaSvar').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('dagligRapport').timeBased().atHour(7).nearMinute(0).everyDays(1).create();

  const antal = markeraBefintligaKontakter_();
  SpreadsheetApp.getUi().alert(
    'Installerat.\n\n' +
    antal + ' bolag har redan mailkontakt med dig i Gmail och är satta till "Hoppa över" (se kolumnen Anteckning).\n\n' +
    'Nästa steg: Driftsätt → Ny driftsättning → Webbapp (Kör som: Jag, Åtkomst: Alla) och klistra in URL:en i Inställningar → Spårnings-URL. ' +
    'Skicka sedan ett testmail via menyn.');
}

function starta() { satt_('Kampanj aktiv', 'JA'); logg_('', 'Kampanj', 'Startad'); }
function pausa() { satt_('Kampanj aktiv', 'NEJ'); logg_('', 'Kampanj', 'Pausad'); }

// ---------------------------------------------------------------- Utskick

/** Körs var 5:e minut. Skickar högst ett mail per körning. */
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const inst = inst_();
    if (String(inst['Kampanj aktiv']).toUpperCase() !== 'JA') return;
    const nu = new Date();
    if (nu < datum_(inst['Startdatum'])) return;
    if (!String(inst['Sändningsdagar']).split(',').map(Number).includes(veckodag_(nu))) return;

    const kvar = minuterKvarIFonster_(inst['Tidsfönster'], nu);
    if (kvar === null) return; // utanför tidsfönster

    const tak = dagensTak_(inst, nu);
    const skickat = skickatIdag_();
    if (skickat >= tak) return;

    // Sprid resten av dagens utskick jämnt över återstående körningar.
    const korningarKvar = Math.max(1, Math.floor(kvar / 5));
    const sannolikhet = (tak - skickat) / korningarKvar;
    if (Math.random() > sannolikhet) return;

    const k = kampanj_();
    const rad = nastaAttSkicka_(k, inst, nu);
    if (!rad) return;

    Utilities.sleep(Math.floor(Math.random() * 60000)); // jitter så tiderna inte blir exakta
    skicka_(k, rad, inst);
  } finally {
    lock.releaseLock();
  }
}

function nastaAttSkicka_(k, inst, nu) {
  const d1 = Number(inst['Uppföljning 1 efter arbetsdagar']) || 5;
  const d2 = Number(inst['Uppföljning 2 efter arbetsdagar']) || 5;
  const uppf2 = String(inst['Uppföljning 2 aktiv']).toUpperCase() === 'JA';

  // Uppföljningar som förfallit går först, så att takten hålls.
  for (const r of k.rader) {
    if (r.get('Status') === STATUS.SKICKAT && r.get('Mail 1 skickat') &&
        laggTillArbetsdagar_(new Date(r.get('Mail 1 skickat')), d1) <= nu) {
      return {rad: r, steg: 2};
    }
    if (r.get('Status') === STATUS.UPPF1 && r.get('Uppföljning 1 skickat')) {
      const forfaller = laggTillArbetsdagar_(new Date(r.get('Uppföljning 1 skickat')), d2);
      if (forfaller <= nu) {
        if (uppf2) return {rad: r, steg: 3};
        r.set('Status', STATUS.KLAR);
      }
    }
    if (r.get('Status') === STATUS.UPPF2 && r.get('Uppföljning 2 skickat') &&
        laggTillArbetsdagar_(new Date(r.get('Uppföljning 2 skickat')), 5) <= nu) {
      r.set('Status', STATUS.KLAR);
    }
  }
  const ny = k.rader.find(r => r.get('Status') === STATUS.VANTAR && r.get('E-post'));
  return ny ? {rad: ny, steg: 1} : null;
}

function skicka_(k, {rad, steg}, inst) {
  const mallar = mallar_();
  const id = rad.get('ID');
  try {
    if (steg === 1) {
      const m = rendera_(mallar, rad, inst, 1);
      const res = skickaGmail_({
        till: rad.get('E-post'), amne: m.amne, text: m.text, html: m.html, inst,
      });
      rad.set('Mail 1 skickat', new Date());
      rad.set('Tråd-ID', res.threadId);
      rad.set('Message-ID', res.messageIdHeader);
      rad.set('Status', STATUS.SKICKAT);
    } else {
      const m = rendera_(mallar, rad, inst, steg);
      skickaGmail_({
        till: rad.get('E-post'), amne: 'Re: ' + m.amne, text: m.text, html: m.html, inst,
        threadId: rad.get('Tråd-ID'), inReplyTo: rad.get('Message-ID'),
      });
      rad.set(steg === 2 ? 'Uppföljning 1 skickat' : 'Uppföljning 2 skickat', new Date());
      rad.set('Status', steg === 2 ? STATUS.UPPF1 : STATUS.UPPF2);
    }
    raknaSkickat_();
    logg_(id, 'Skickat steg ' + steg, rad.get('E-post'));
  } catch (e) {
    rad.set('Status', STATUS.FEL);
    rad.set('Anteckning', String(e).slice(0, 300));
    logg_(id, 'Fel vid utskick', String(e));
  }
}

/** Skickar ett testmail (rad 1–3 i listan) till rapportadressen. */
function skickaTest() {
  const inst = inst_();
  const mallar = mallar_();
  const k = kampanj_();
  const till = inst['Rapport till'];
  const exempel = [
    k.rader.find(r => Number(r.get('Bilar på Blocket')) >= 5 && r.get('Verkstad') === 'Ja'),
    k.rader.find(r => Number(r.get('Bilar på Blocket')) < 5),
  ].filter(Boolean);
  exempel.forEach(r => {
    const m = rendera_(mallar, r, inst, 1, /*test*/ true);
    skickaGmail_({till, amne: '[TEST ' + r.get('ID') + '] ' + m.amne, text: m.text, html: m.html, inst});
  });
  SpreadsheetApp.getUi().alert(exempel.length + ' testmail skickade till ' + till + '. Kolla att de hamnar i inkorgen och att signaturen ser rätt ut.');
}

// ---------------------------------------------------------------- Rendering

function rendera_(mallar, rad, inst, steg, test) {
  const bilar = Number(rad.get('Bilar på Blocket')) || 0;
  const vars = {
    '{bolag}': rad.get('Bolag'),
    '{ort}': rad.get('Ort'),
    '{län}': rad.get('Län'),
    '{möteslängd}': inst['Möteslängd'] || '20 min',
    '{verkstadsrad}': rad.get('Verkstad') === 'Ja' ? (mallar['Verkstadsrad'] || '') : '',
  };
  vars['{öppning}'] = ersatt_(bilar >= 5 ? mallar['Öppning 5+ bilar'] : mallar['Öppning färre bilar'], vars);

  const amne = ersatt_(mallar['Ämne'], vars);
  const mall = steg === 1 ? mallar['Mail 1'] : steg === 2 ? mallar['Uppföljning 1'] : mallar['Uppföljning 2'];
  const brod = stada_(ersatt_(mall, vars));

  let html = textTillHtml_(brod);
  let text = brod;
  if (steg === 1) {
    const sig = signatur_();
    html += '<br><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature">' + sig.html + '</div>';
    text += '\n\n-- \n' + sig.text;
    const url = inst['Spårnings-URL'];
    if (url && !test) {
      html += '<img src="' + url + '?id=' + encodeURIComponent(rad.get('ID')) + '&v=' + Date.now() +
        '" width="1" height="1" alt="" style="border:0;width:1px;height:1px">';
    }
  }
  return {amne, text, html: '<div dir="ltr">' + html + '</div>'};
}

function ersatt_(s, vars) {
  return Object.keys(vars).reduce((acc, k) => acc.split(k).join(vars[k] == null ? '' : String(vars[k])), String(s || ''));
}

function stada_(s) {
  return s.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function textTillHtml_(s) {
  return s.split('\n').map(l => l ? '<div>' + esc_(l) + '</div>' : '<div><br></div>').join('');
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Hämtar användarens riktiga Gmail-signatur (HTML) en gång per körning. */
let signaturCache_ = null;
function signatur_() {
  if (signaturCache_) return signaturCache_;
  const jag = Session.getActiveUser().getEmail();
  let html = '';
  try {
    html = Gmail.Users.Settings.SendAs.get('me', jag).signature || '';
  } catch (e) {
    logg_('', 'Signatur', 'Kunde inte läsa Gmail-signaturen: ' + e);
  }
  if (!html) throw new Error('Ingen Gmail-signatur hittades för ' + jag + '. Lägg in den i Gmail → Inställningar → Signatur.');
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{2,}/g, '\n').trim();
  signaturCache_ = {html, text};
  return signaturCache_;
}

// ---------------------------------------------------------------- Gmail API

function skickaGmail_({till, amne, text, html, inst, threadId, inReplyTo}) {
  const jag = Session.getActiveUser().getEmail();
  const grans = 'tm_' + Utilities.getUuid().replace(/-/g, '');
  const rader = [
    'From: ' + kodaHeader_(inst['Avsändarnamn'] || '') + ' <' + jag + '>',
    'To: ' + till,
    'Subject: ' + kodaHeader_(amne),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + grans + '"',
  ];
  if (inReplyTo) {
    rader.push('In-Reply-To: ' + inReplyTo);
    rader.push('References: ' + inReplyTo);
  }
  const del = (typ, innehall) => [
    '--' + grans,
    'Content-Type: ' + typ + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Utilities.base64Encode(innehall, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  const mime = rader.join('\r\n') + '\r\n\r\n' + del('text/plain', text) + '\r\n' + del('text/html', html) + '\r\n--' + grans + '--';

  const body = {raw: Utilities.base64EncodeWebSafe(mime)};
  if (threadId) body.threadId = threadId;
  const skickat = Gmail.Users.Messages.send(body, 'me');

  const meta = Gmail.Users.Messages.get('me', skickat.id, {format: 'metadata', metadataHeaders: ['Message-ID', 'Message-Id']});
  const h = (meta.payload.headers || []).find(x => /^message-id$/i.test(x.name));
  return {id: skickat.id, threadId: skickat.threadId, messageIdHeader: h ? h.value : ''};
}

function kodaHeader_(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
}

// ---------------------------------------------------------------- Svar, studs, öppningar

/** Går igenom alla aktiva trådar: svar stoppar sekvensen, studs markeras. */
function kollaSvar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const jag = Session.getActiveUser().getEmail().toLowerCase();
    const k = kampanj_();
    let skickade = 0, studsar = 0;
    for (const r of k.rader) {
      if (r.get('Mail 1 skickat')) skickade++;
      if (r.get('Status') === STATUS.STUDS) studsar++;
      if (!KOLLA_SVAR.includes(r.get('Status')) || !r.get('Tråd-ID')) continue;

      let trad;
      try {
        trad = Gmail.Users.Threads.get('me', r.get('Tråd-ID'), {format: 'metadata', metadataHeaders: ['From', 'Subject', 'Auto-Submitted']});
      } catch (e) { continue; }

      for (const m of trad.messages || []) {
        const h = namn => ((m.payload.headers || []).find(x => x.name.toLowerCase() === namn) || {}).value || '';
        const fran = h('from').toLowerCase();
        if (fran.includes(jag)) continue;
        if (STUDS_FRAN_REGEX.test(fran)) {
          r.set('Status', STATUS.STUDS); studsar++;
          logg_(r.get('ID'), 'Studs', fran);
          break;
        }
        const auto = /auto-(replied|generated)/i.test(h('auto-submitted')) || AUTOSVAR_REGEX.test(h('subject'));
        if (auto) continue; // autosvar räknas inte som svar
        const nej = NEJ_REGEX.test(m.snippet || '');
        r.set('Status', nej ? STATUS.NEJ : STATUS.SVARAT);
        r.set('Svarat', new Date(Number(m.internalDate)));
        logg_(r.get('ID'), nej ? 'Nej tack' : 'Svar', (m.snippet || '').slice(0, 200));
        break;
      }
    }

    const inst = inst_();
    const max = Number(inst['Max studs %']) || 5;
    if (skickade >= 20 && (studsar / skickade) * 100 > max && String(inst['Kampanj aktiv']).toUpperCase() === 'JA') {
      satt_('Kampanj aktiv', 'NEJ');
      GmailApp.sendEmail(inst['Rapport till'], 'Mailbot pausad: för många studsar',
        studsar + ' av ' + skickade + ' mail har studsat (' + Math.round(studsar / skickade * 100) + ' %). Kampanjen är pausad. Kolla listan innan du startar igen.');
      logg_('', 'Kampanj', 'Pausad av studsbromsen');
    }
  } finally {
    lock.releaseLock();
  }
}

/** Spårningspixeln. Driftsätts som webbapp (Kör som: jag, Åtkomst: alla). */
function doGet(e) {
  const id = e && e.parameter && e.parameter.id;
  if (id) {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        const k = kampanj_();
        const r = k.rader.find(x => x.get('ID') === id);
        const skickat = r && r.get('Mail 1 skickat') ? new Date(r.get('Mail 1 skickat')) : null;
        // Ignorera laddningar direkt efter utskick (förhandsladdning, egen Skickat-vy).
        if (r && skickat && Date.now() - skickat.getTime() > 2 * 60 * 1000) {
          const nu = new Date();
          r.set('Öppningar', (Number(r.get('Öppningar')) || 0) + 1);
          if (!r.get('Första öppning')) r.set('Första öppning', nu);
          r.set('Senaste öppning', nu);
        }
      } finally {
        lock.releaseLock();
      }
    }
  }
  return ContentService.createTextOutput('');
}

// ---------------------------------------------------------------- Rapport

/** Daglig het-lista kl 07: vilka ska ringas idag. */
function dagligRapport() {
  const inst = inst_();
  const k = kampanj_();
  const nu = Date.now();
  const dygn = 24 * 3600 * 1000;
  const rakna = s => k.rader.filter(r => r.get('Status') === s).length;

  const heta = k.rader.filter(r => AKTIVA.includes(r.get('Status')) &&
      (Number(r.get('Öppningar')) >= 2 || (r.get('Senaste öppning') && nu - new Date(r.get('Senaste öppning')).getTime() < 2 * dygn)))
    .sort((a, b) => (Number(b.get('Öppningar')) || 0) - (Number(a.get('Öppningar')) || 0))
    .slice(0, 25);
  const nyaSvar = k.rader.filter(r => r.get('Svarat') && nu - new Date(r.get('Svarat')).getTime() < 1.5 * dygn);

  const skickade = k.rader.filter(r => r.get('Mail 1 skickat')).length;
  const oppnade = k.rader.filter(r => Number(r.get('Öppningar')) > 0).length;
  const svar = rakna(STATUS.SVARAT) + rakna(STATUS.NEJ);

  const rad = r => '<tr><td>' + esc_(r.get('Bolag')) + '</td><td>' + esc_(r.get('Ort')) + '</td><td>' + esc_(r.get('Telefon')) +
    '</td><td>' + esc_(r.get('Öppningar') || 0) + '</td><td>' + esc_(r.get('Status')) + '</td></tr>';
  const tabell = lista => '<table cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr><th align="left">Bolag</th><th align="left">Ort</th><th align="left">Telefon</th><th align="left">Öppn.</th><th align="left">Status</th></tr>' + lista.map(rad).join('') + '</table>';

  const html =
    '<p><b>Totalt:</b> ' + skickade + ' skickade · ' + oppnade + ' öppnade · ' + svar + ' svar (' + rakna(STATUS.NEJ) + ' nej tack) · ' +
    rakna(STATUS.STUDS) + ' studsar · ' + rakna(STATUS.VANTAR) + ' kvar i kön</p>' +
    (nyaSvar.length ? '<h3>Nya svar att hantera (' + nyaSvar.length + ')</h3>' + tabell(nyaSvar) : '') +
    '<h3>Ring idag (' + heta.length + ')</h3>' +
    (heta.length ? '<p>Har öppnat flera gånger eller nyligen, men inte svarat.</p>' + tabell(heta) : '<p>Inga heta leads just nu.</p>') +
    '<p><a href="' + SpreadsheetApp.getActive().getUrl() + '">Öppna kampanjarket</a></p>';

  GmailApp.sendEmail(inst['Rapport till'], 'Mailbot: het-lista ' + Utilities.formatDate(new Date(), 'Europe/Stockholm', 'd MMM'), '', {htmlBody: html});
}

// ---------------------------------------------------------------- Befintliga kontakter

/** Sätter "Hoppa över" på bolag du redan mailat med, så de inte får ett kallmail. */
function markeraBefintligaKontakter_() {
  const fri = /@(gmail|hotmail|outlook|live|yahoo|telia|icloud|me|bredband|spray|home)\./i;
  const k = kampanj_();
  let antal = 0;
  for (const r of k.rader) {
    if (r.get('Status') !== STATUS.VANTAR) continue;
    const epost = String(r.get('E-post'));
    const mal = fri.test(epost) ? epost : epost.split('@')[1];
    const q = '{from:' + mal + ' to:' + mal + '}';
    const svar = Gmail.Users.Threads.list('me', {q: q, maxResults: 1});
    if (svar.threads && svar.threads.length) {
      r.set('Status', STATUS.HOPPA);
      r.set('Anteckning', 'Befintlig kontakt i Gmail – kolla innan du ändrar till Väntar');
      antal++;
    }
  }
  return antal;
}

// ---------------------------------------------------------------- Ark-hjälpare

function kampanj_() {
  const blad = SpreadsheetApp.getActive().getSheetByName(FLIK_KAMPANJ);
  const data = blad.getDataRange().getValues();
  const rubriker = data[0].map(String);
  const kol = {};
  rubriker.forEach((h, i) => { kol[h] = i; });
  const rader = data.slice(1).map((v, i) => ({
    get: namn => v[kol[namn]],
    set: (namn, varde) => {
      if (!(namn in kol)) throw new Error('Kolumnen "' + namn + '" saknas i Kampanj');
      v[kol[namn]] = varde;
      blad.getRange(i + 2, kol[namn] + 1).setValue(varde);
    },
  }));
  return {blad, rader};
}

function inst_() {
  const v = SpreadsheetApp.getActive().getSheetByName(FLIK_INST).getDataRange().getValues();
  const ut = {};
  v.slice(1).forEach(r => { ut[r[0]] = r[1]; });
  return ut;
}

function satt_(nyckel, varde) {
  const blad = SpreadsheetApp.getActive().getSheetByName(FLIK_INST);
  const v = blad.getDataRange().getValues();
  const i = v.findIndex(r => r[0] === nyckel);
  if (i > 0) blad.getRange(i + 1, 2).setValue(varde);
}

function mallar_() {
  const v = SpreadsheetApp.getActive().getSheetByName(FLIK_MALLAR).getDataRange().getValues();
  const ut = {};
  v.slice(1).forEach(r => { ut[r[0]] = r[1]; });
  return ut;
}

function logg_(id, handelse, detalj) {
  const blad = SpreadsheetApp.getActive().getSheetByName(FLIK_LOGG);
  if (blad) blad.appendRow([new Date(), id, handelse, detalj]);
}

// ---------------------------------------------------------------- Tid och takt

function datum_(v) {
  if (v instanceof Date) return v;
  const [y, m, d] = String(v).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function veckodag_(d) {
  const w = Number(Utilities.formatDate(d, 'Europe/Stockholm', 'u')); // 1 = mån … 7 = sön
  return w;
}

/** Minuter kvar av aktuellt tidsfönster plus senare fönster idag, eller null om vi är utanför. */
function minuterKvarIFonster_(fonster, nu) {
  const min = Number(Utilities.formatDate(nu, 'Europe/Stockholm', 'H')) * 60 + Number(Utilities.formatDate(nu, 'Europe/Stockholm', 'm'));
  const tillMin = s => { const [h, m] = s.trim().split(':').map(Number); return h * 60 + m; };
  const lista = String(fonster).split(',').map(f => f.split('-').map(tillMin));
  if (!lista.some(([a, b]) => min >= a && min < b)) return null;
  return lista.reduce((sum, [a, b]) => sum + Math.max(0, b - Math.max(a, min)), 0);
}

function dagensTak_(inst, nu) {
  const dagar = Math.floor((nu - datum_(inst['Startdatum'])) / (24 * 3600 * 1000));
  if (dagar < 7) return Number(inst['Mail per dag vecka 1']) || 20;
  if (dagar < 14) return Number(inst['Mail per dag vecka 2']) || 30;
  return Number(inst['Mail per dag därefter']) || 40;
}

function laggTillArbetsdagar_(fran, n) {
  const d = new Date(fran);
  let kvar = n;
  while (kvar > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) kvar--;
  }
  return d;
}

function dagNyckel_() {
  return 'skickat_' + Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy-MM-dd');
}

function skickatIdag_() {
  return Number(PropertiesService.getScriptProperties().getProperty(dagNyckel_())) || 0;
}

function raknaSkickat_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty(dagNyckel_(), String(skickatIdag_() + 1));
}
