// Single source of truth for validation rules.
// The server enforces them; the client uses them for maxLength/min/max on inputs,
// so the browser and the API can never disagree about what is valid.

export const LOCALES = ['vi', 'en'];
export const PERSON_COLORS = ['teal', 'amber', 'rose', 'ink'];
export const MEDIA_KINDS = ['film', 'music'];
// Keepsake cards ("thẻ kỷ niệm") made from a memory. Saved ones are the artifacts ("Kỷ vật") of the album.
export const CARD_KINDS = ['postcard', 'stamp', 'photo'];
export const CARD_STYLES = ['paper', 'darkroom'];
// Public contact form. The same three values are stored and shown in both languages.
export const CONTACT_KINDS = ['feedback', 'suggestion', 'collaboration'];

export const LIMITS = {
  userName: 60,
  email: 254,
  passwordMin: 8,
  passwordMax: 200,

  memoryTitle: 120,
  memoryPlace: 120,
  memoryStory: 5000,
  yearMin: 1850,
  maxTaggedPeople: 50,
  maxFilesPerMemory: 20,
  // 10 minutes. The browser reports a duration and the server checks it again with
  // ffmpeg while sampling frames (see server/lib/videoCheck.js). The file itself is
  // not recompressed — that is still future work. The byte cap is MAX_VIDEO_MB.
  videoMaxSeconds: 10 * 60,

  comment: 2000,
  inviteLabel: 80,

  personName: 80,
  personRelation: 80,
  note: 2000,

  mediaTitle: 120,
  mediaOwner: 60,
  mediaEra: 60,
  mediaUrl: 500,
  mediaStory: 2000,

  // The text written on a keepsake card (the card studio's fields).
  cardTitle: 80,
  cardLine: 90,
  cardMessage: 260,
  cardRecipient: 40,

  searchQuery: 100,

  contactName: 80,
  contactMessage: 500,
};
