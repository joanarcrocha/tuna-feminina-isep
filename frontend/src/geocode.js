// Procura as coordenadas de uma cidade no OpenStreetMap (para o mapa dos festivais).
export async function geocode(local) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pt,es&q=' + encodeURIComponent(local);
    const [hit] = await (await fetch(url, { headers: { 'Accept-Language': 'pt-PT' } })).json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
