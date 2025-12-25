const NarrativeAPI = (() => {
  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Narrative API error: ${res.status}`);
    return res.json();
  }

  return {
    getMain: () => getJson('/api/narrative/main'),
    getDialogList: () => getJson('/api/narrative/dialog'),
    getDialog: (npcKey) => getJson(`/api/narrative/dialog/${npcKey}`),
    getTerminals: () => getJson('/api/narrative/terminals'),
    getEncounters: () => getJson('/api/narrative/encounters'),
    getCollectibles: () => getJson('/api/narrative/collectibles')
  };
})();

