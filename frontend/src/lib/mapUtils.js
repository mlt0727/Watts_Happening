export function hasValidReference(reference) {
  return !!(
    reference &&
    Number.isFinite(reference.lat) &&
    Number.isFinite(reference.lon) &&
    reference.lat >= -90 &&
    reference.lat <= 90 &&
    reference.lon >= -180 &&
    reference.lon <= 180
  );
}

export function buildCandidatePosition(candidate, fallbackReferences = []) {
  if (!candidate) {
    return null;
  }

  const validReferences = [
    candidate.descReference,
    candidate.gpcReference,
    ...fallbackReferences,
  ].filter(hasValidReference);

  if (!validReferences.length) {
    return null;
  }

  const [firstReference, secondReference] = validReferences;

  if (!secondReference) {
    return {
      lat: firstReference.lat,
      lon: firstReference.lon,
    };
  }

  return {
    lat: (firstReference.lat + secondReference.lat) / 2,
    lon: (firstReference.lon + secondReference.lon) / 2,
  };
}
