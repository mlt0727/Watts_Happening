import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";
import "leaflet/dist/leaflet.css";

// Fix marker icons for Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const ProjectMap = () => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    // Load and parse the CSV file
    Papa.parse("/data/projects.csv", {
      download: true,
      header: true,
      complete: (result) => {
        setProjects(result.data);
      },
    });
  }, []);

  return (
    <MapContainer center={[33.0, -82.0]} zoom={7} style={{ height: "100vh", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {projects.map((project, index) => {
        const lat = parseFloat(project.lat_center);
        const lon = parseFloat(project.lon_center);

        // Ensure valid coordinates
        if (!isNaN(lat) && !isNaN(lon)) {
          return (
            <Marker key={index} position={[lat, lon]}>
              <Popup>
                <strong>{project.project_name}</strong>
                <br />
                Utility: {project.utility}
                <br />
                State: {project.state}
                <br />
                In Service Date: {project.in_service_date}
              </Popup>
            </Marker>
          );
        }
        return null;
      })}
    </MapContainer>
  );
};

export default ProjectMap;