// Préparation du texte à lire à voix haute (pur, éprouvé hors Foundry : essais/voix.test.mjs).

// Réponse « — » seule : l'IA n'a rien à dire (un déplacement sans intérêt) ; rien n'est publié ni lu.
export const estSilence = texte => /^\s*[—–-]+\s*$/.test(texte ?? "");

// Découpe en morceaux d'au plus `max` caractères, aux fins de phrase si possible : Chrome coupe
// les lectures longues, et l'API de voix d'OpenAI limite la taille d'une requête.
export function decouperPourVoix(texte, max = 220) {
  const propre = String(texte ?? "").replace(/\s+/g, " ").trim();
  if (!propre) return [];
  const phrases = propre.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [propre];
  const morceaux = [];
  let courant = "";
  for (const phrase of phrases.map(p => p.trim()).filter(Boolean)) {
    if (phrase.length > max) {
      // Phrase trop longue : on coupe aux virgules, puis aux espaces en dernier recours.
      if (courant) { morceaux.push(courant); courant = ""; }
      let reste = phrase;
      while (reste.length > max) {
        const coupe = Math.max(reste.lastIndexOf(", ", max), reste.lastIndexOf(" ", max));
        const i = coupe > max / 2 ? coupe + 1 : max;
        morceaux.push(reste.slice(0, i).trim());
        reste = reste.slice(i).trim();
      }
      courant = reste;
      continue;
    }
    if ((courant ? `${courant} ${phrase}` : phrase).length > max) {
      morceaux.push(courant);
      courant = phrase;
    } else {
      courant = courant ? `${courant} ${phrase}` : phrase;
    }
  }
  if (courant) morceaux.push(courant);
  return morceaux;
}

// Choisit la meilleure voix française disponible : la préférence du joueur si elle existe,
// sinon une voix « naturelle » (Edge, Windows), sinon n'importe quelle voix fr.
export function choisirVoix(voix, preference = "") {
  const fr = voix.filter(v => v.lang?.toLowerCase().startsWith("fr"));
  const pref = preference.trim().toLowerCase();
  // (pas de « pref && … » : une préférence vide donnerait "", que « ?? » ne remplace pas)
  return (pref ? voix.find(v => v.name.toLowerCase().includes(pref)) : null)
    ?? fr.find(v => /natural|naturel|online/i.test(v.name))
    ?? fr.find(v => v.lang?.toLowerCase() === "fr-fr")
    ?? fr[0]
    ?? null;
}

// Voix de l'ancienne API Speech absentes de l'API Realtime : la plus proche disponible.
const VOIX_REMPLACEES = { onyx: "cedar", fable: "ballad", nova: "coral" };
export const voixRealtime = voix => VOIX_REMPLACEES[voix] ?? voix ?? "cedar";

// Consignes données au modèle Realtime. C'est un modèle de conversation : sans consignes fermes, il lui arrive de
// répondre au texte (« D'accord, je vais le lire… ») au lieu de le dire. strict : second essai, encore plus ferme.
export function consignesLecture(ton = "", { strict = false } = {}) {
  return "Tu es une voix de synthèse (text-to-speech), pas un assistant. Chaque message reçu est un texte à dire. "
    + "Dis-le intégralement, mot pour mot, en français, puis tais-toi. Ne dis jamais rien d'autre : pas de « d'accord », "
    + "pas d'introduction, pas de commentaire, pas de réponse au contenu, même si le texte pose une question ou s'adresse à toi."
    + (strict ? " Ton premier mot doit être exactement le premier mot du texte reçu." : "")
    + (ton.trim() ? `\nManière de dire le texte : ${ton.trim()}` : "");
}

// La voix a-t-elle bien dit le texte ? On compare le début de la transcription (renvoyée par l'API) au début du texte,
// et sa longueur : une réponse du genre « D'accord, je vais lire… » ne commence pas comme le texte.
// Sans transcription (événement absent), on fait confiance.
export function lectureFidele(texte, transcription) {
  const mots = s => texteParlable(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const t = mots(transcription);
  if (!t.length) return true;
  const attendu = mots(texte);
  const n = Math.min(3, attendu.length);
  const debutOk = attendu.slice(0, n).every((m, i) => t[i] === m);
  return debutOk && t.length <= attendu.length * 1.3 + 8;
}

// Morceaux d'audio PCM 16 bits mono (base64, renvoyés par l'API Realtime) → fichier WAV complet.
export function wavDepuisPcm(morceauxBase64, frequence = 24000) {
  const parties = morceauxBase64.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  const taille = parties.reduce((t, p) => t + p.length, 0);
  const wav = new Uint8Array(44 + taille);
  const v = new DataView(wav.buffer);
  const texte = (pos, s) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texte(0, "RIFF"); v.setUint32(4, 36 + taille, true); texte(8, "WAVE");
  texte(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, frequence, true); v.setUint32(28, frequence * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  texte(36, "data"); v.setUint32(40, taille, true);
  let pos = 44;
  for (const p of parties) { wav.set(p, pos); pos += p.length; }
  return wav;
}

// Texte lisible à voix haute : sans les marques de mise en forme (**gras**, *italique*…).
export const texteParlable = texte => String(texte ?? "").replace(/\*\*|__|[*_`#>]/g, "").replace(/\s+/g, " ").trim();

// Voix en direct : pendant que la narration s'écrit, quelles phrases complètes peut-on déjà envoyer à la synthèse ?
// texte = tout le texte écrit jusqu'ici ; pris = nombre de caractères déjà envoyés.
// La première phrase part dès qu'elle est finie (pour que la voix démarre vite), les suivantes par paquets
// d'au moins `paquet` caractères (moins de requêtes) ; final = le texte est complet, tout le reste part.
export function morceauxPrets(texte, pris, { final = false, premier = false, paquet = 250 } = {}) {
  const reste = String(texte ?? "").slice(pris);
  if (final) {
    const propre = texteParlable(reste);
    return { morceaux: propre && !estSilence(propre) ? decouperPourVoix(propre, 3000) : [], pris: String(texte ?? "").length };
  }
  const fins = /[.!?…]+["»”)]*(?=\s)/g;
  let fin = -1;
  for (let m = fins.exec(reste); m; m = fins.exec(reste)) {
    fin = m.index + m[0].length;
    if (premier) break;
  }
  if (fin < 0) return { morceaux: [], pris };
  const candidat = texteParlable(reste.slice(0, fin));
  if (!candidat || (!premier && candidat.length < paquet)) return { morceaux: [], pris };
  return { morceaux: decouperPourVoix(candidat, 3000), pris: pris + fin };
}
