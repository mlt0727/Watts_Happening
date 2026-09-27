import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BASE_LAYER =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function referenceKey(reference) {
  return `${reference.lat}:${reference.lon}`;
}

function validReference(reference) {
  return reference &&
    Number.isFinite(reference.lat) && Number.isFinite(reference.lon) &&
    Math.abs(reference.lat) <= 90 && Math.abs(reference.lon) <= 180;
}

function textElement(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  return element;
}

function popupContent(title, lines, note) {
  const content = document.createElement("div");
  content.append(textElement("strong", title));
  lines.forEach((line) => {
    content.append(document.createElement("br"), document.createTextNode(line ?? ""));
  });
  content.append(document.createElement("br"), textElement("small", note));
  return content;
}

export default function OpportunityMap({
  opportunity,
  referenceAreas,
  opportunities,
  highlightedOpportunityIds,
  selectedOpportunityId,
  selectedReference,
  onSelectOpportunity,
  onSelectReference,
}) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const layerGroup = useRef(null);

  useEffect(() => {
    if (!mapElement.current) return undefined;

    const map = L.map(mapElement.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([39.5, -98.35], 4);
    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer(BASE_LAYER, {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);

    mapInstance.current = map;
    layerGroup.current = L.layerGroup().addTo(map);
    const container = mapElement.current;
    let resizeFrame;
    const refreshSize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (container.clientWidth && container.clientHeight) {
          map.invalidateSize({ animate: false, debounceMoveend: true });
        }
      });
    };
    // The adjacent project details can resize the grid after cloud data loads.
    const resizeObserver = new ResizeObserver(refreshSize);
    resizeObserver.observe(container);
    refreshSize();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      map.remove();
      mapInstance.current = null;
      layerGroup.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const layers = layerGroup.current;
    if (!map || !layers) return;

    layers.clearLayers();

    const pairReferences = [opportunity?.descReference, opportunity?.gpcReference]
      .filter(validReference);
    const selectedReferences = [...pairReferences, selectedReference].filter(validReference);
    const selectedKeys = new Set(selectedReferences.map(referenceKey));
    const highlightedIds = new Set(highlightedOpportunityIds);

    Object.values(referenceAreas).forEach((reference) => {
      if (!validReference(reference)) return;
      const selected = selectedKeys.has(referenceKey(reference));
      const circle = L.circleMarker([reference.lat, reference.lon], {
        bubblingMouseEvents: false,
        radius: selected ? 8 : 6,
        color: selected ? "#fff7ed" : "#234d56",
        weight: selected ? 2 : 1,
        fillColor: selected ? "#e5683e" : "#95b7a8",
        fillOpacity: 0.95,
      })
        .bindTooltip(textElement("span", reference.label), { direction: "top", offset: [0, -6] })
        .bindPopup(
          popupContent(reference.label, [reference.name], "Substation coordinates from the shared project dataset."),
        )
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          onSelectReference?.(reference);
        })
        .addTo(layers);

      const element = circle.getElement();
      if (element && onSelectReference) {
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", `Select station ${reference.name}`);
        element.setAttribute("aria-pressed", String(selected));
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            circle.fire("click");
          }
        });
      }
    });

    const opportunityGroups = new Map();
    opportunities.forEach((candidate, candidateIndex) => {
      if (!validReference(candidate.descReference) || !validReference(candidate.gpcReference)) return;
      const position = {
        lat: (candidate.descReference.lat + candidate.gpcReference.lat) / 2,
        lon: (candidate.descReference.lon + candidate.gpcReference.lon) / 2,
      };
      const key = `${position.lat.toFixed(5)}:${position.lon.toFixed(5)}`;
      const group = opportunityGroups.get(key) ?? [];
      group.push({ candidate, position, candidateIndex });
      opportunityGroups.set(key, group);
    });

    opportunityGroups.forEach((group) => {
      group.forEach(({ candidate, position, candidateIndex }, index) => {
        const selected = candidate.id === selectedOpportunityId;
        const related = highlightedIds.has(candidate.id);
        const horizontalOffset = (index - (group.length - 1) / 2) * 38;
        const markerNumber =
          candidate.mapNumber ??
          candidate.rank ??
          candidateIndex + 1;
        const markerDescription = `Map marker ${markerNumber}: ${candidate.descReference.name} ↔ ${candidate.gpcReference.name}`;
        const markerTitle = `${markerDescription} — ${candidate.descProject.title}; ${candidate.gpcProject.title}`;
        const icon = L.divIcon({
          className: "pairing-map-icon",
          html: `<span class="pairing-map-dot${selected ? " pairing-map-dot-selected" : ""}${related ? " pairing-map-dot-related" : " pairing-map-dot-muted"}">${markerNumber}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15 - horizontalOffset, 15],
        });
        const marker = L.marker([position.lat, position.lon], {
          icon,
          keyboard: true,
          title: markerTitle,
          zIndexOffset: selected ? 1000 : related ? 500 : 0,
        });

        marker
          .bindTooltip(textElement("span", markerTitle), { direction: "top", offset: [0, -6] })
          .bindPopup(
            popupContent(markerDescription, [candidate.descProject.title, candidate.gpcProject.title], "Pairing marker between recorded endpoints; not a transmission route."),
          )
          .on("click", () => onSelectOpportunity(candidate.id))
          .addTo(layers);
      });
    });

    const referenceDistance = opportunity?.referenceDistanceMiles;
    if (pairReferences.length === 2 && Number.isFinite(referenceDistance)) {
      L.polyline(
        [
          [opportunity.descReference.lat, opportunity.descReference.lon],
          [opportunity.gpcReference.lat, opportunity.gpcReference.lon],
        ],
        { color: "#e5683e", weight: 3, opacity: 0.9, dashArray: "7 7", interactive: false },
      ).addTo(layers);

    }

    const viewportReferences = [...new Map(
      selectedReferences.map((reference) => [referenceKey(reference), reference]),
    ).values()];
    if (viewportReferences.length > 1) {
      map.fitBounds(viewportReferences.map(({ lat, lon }) => [lat, lon]), {
        padding: [70, 70], maxZoom: 8,
      });
    } else if (viewportReferences.length) {
      map.setView(
        [viewportReferences[0].lat, viewportReferences[0].lon],
        7,
      );
    } else {
      const availableReferences = Object.values(referenceAreas).filter(validReference);
      if (availableReferences.length) {
        map.fitBounds(availableReferences.map(({ lat, lon }) => [lat, lon]), {
          padding: [70, 70], maxZoom: 8,
        });
      } else {
        map.setView([39.5, -98.35], 4);
      }
    }
  }, [
    opportunity,
    referenceAreas,
    opportunities,
    highlightedOpportunityIds,
    selectedOpportunityId,
    selectedReference,
    onSelectOpportunity,
    onSelectReference,
  ]);

  return (
    <div
      className="opportunity-map"
      ref={mapElement}
      role="region"
      aria-label="Interactive map with recorded substation endpoints and opportunity pairings"
    />
  );
}
