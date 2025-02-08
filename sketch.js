let map = L.map('map').setView([20, 0], 2);
let currentLayer;
let currentPollutant = 'PM2.5 (μg/m3)';
let studentData = {};

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function getColor(value) {
    return value > 100 ? '#800026' :
           value > 75  ? '#BD0026' :
           value > 50  ? '#E31A1C' :
           value > 25  ? '#FC4E2A' :
           value > 10  ? '#FD8D3C' :
                        '#FEB24C';
}

function loadCSV(callback) {
    fetch('data/air-quality-data.csv')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').slice(1);
            const airQualityData = lines.map(line => {
                const [region, iso3, country, city, year, pm25, pm10, no2] = line.split(',');
                return { country, iso3, year: parseInt(year), "PM2.5 (μg/m3)": parseFloat(pm25), "PM10 (μg/m3)": parseFloat(pm10), "NO2 (μg/m3)": parseFloat(no2) };
            }).filter(item => (!isNaN(item["PM2.5 (μg/m3)"]) || !isNaN(item["PM10 (μg/m3)"]) || !isNaN(item["NO2 (μg/m3)"])));
            callback(airQualityData);
        });

    fetch('data/number-of-students.csv')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').slice(1);
            lines.forEach(line => {
                const [countryLabel, totalStudents] = line.split(',');
                studentData[countryLabel.trim()] = parseInt(totalStudents);
            });
        });
}

function updateMap(pollutant, year = document.getElementById('year').value) {
    document.getElementById('yearValue').textContent = year;
    currentPollutant = pollutant;

    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    loadCSV(airQualityData => {
        fetch('assets/countries.geojson')
            .then(response => response.json())
            .then(geojson => {
                currentLayer = L.geoJSON(geojson, {
                    style: function(feature) {
                        const data = airQualityData.filter(item => item.iso3 === feature.properties.ISO_A3 && (!item.year || item.year <= year));
                        const avgValue = data.reduce((acc, cur) => acc + cur[pollutant], 0) / data.length;
                        if (data.length > 0 && !isNaN(avgValue)) {
                            return {
                                fillColor: getColor(avgValue),
                                weight: 1,
                                opacity: 1,
                                color: 'white',
                                dashArray: '3',
                                fillOpacity: 0.7
                            };
                        } else {
                            return { fillOpacity: 0 };
                        }
                    },
                    onEachFeature: function (feature, layer) {
                        layer.on('click', function () {
                            const countryName = feature.properties.ADMIN;
                            const totalStudents = studentData[countryName] || 'Data not available';

                            layer.bindPopup(`
                                <strong>Country:</strong> ${countryName}<br>
                                <strong>Students:</strong> ${totalStudents}
                            `).openPopup();
                        });
                    }
                }).addTo(map);
            });
    });
}

document.getElementById('year').addEventListener('input', (e) => updateMap(currentPollutant, e.target.value));

updateMap('PM2.5 (μg/m3)', 2015); // Initial load
