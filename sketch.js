let map = L.map('map').setView([20, 0], 2);
let currentLayer;
let currentPollutant = 'PM2.5 (μg/m3)';
let studentData = {};
let airQualityData = [];
let dropoutRateData = {}; // Store dropout rates by country & year

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function getColor(value, pollutant) {
    if (pollutant === 'PM2.5 (μg/m3)') {
        return value > 100 ? '#800026' : value > 75 ? '#BD0026' : value > 50 ? '#E31A1C' :
               value > 25  ? '#FC4E2A' : value > 10 ? '#FD8D3C' : '#FEB24C';
    } else if (pollutant === 'PM10 (μg/m3)') {
        return value > 100 ? '#0B3D91' : value > 75 ? '#2171B5' : value > 50 ? '#4292C6' :
               value > 25  ? '#6BAED6' : value > 10 ? '#9ECAE1' : '#C6DBEF';
    } else if (pollutant === 'NO2 (μg/m3)') {
        return value > 100 ? '#00441B' : value > 75 ? '#006D2C' : value > 50 ? '#238B45' :
               value > 25  ? '#41AB5D' : value > 10 ? '#74C476' : '#A1D99B';
    }
}

function loadCSV(callback) {
    fetch('data/air-quality-data.csv')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').slice(1);
            airQualityData = lines.map(line => {
                const [region, iso3, country, city, year, pm25, pm10, no2] = line.split(',');
                return {
                    country: country.trim(),
                    iso3: iso3.trim(),
                    year: parseInt(year),
                    "PM2.5 (μg/m3)": parseFloat(pm25),
                    "PM10 (μg/m3)": parseFloat(pm10),
                    "NO2 (μg/m3)": parseFloat(no2)
                };
            }).filter(item => item.iso3 && (!isNaN(item["PM2.5 (μg/m3)"]) || !isNaN(item["PM10 (μg/m3)"]) || !isNaN(item["NO2 (μg/m3)"])));
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

    fetch('data/successrate.csv')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').slice(1);
            lines.forEach(line => {
                const [country, successRate, date] = line.split(',');
                if (!country || !successRate || !date) return;

                const year = date.substring(0, 4); // Extract YYYY from "2015-01-01T00:00:00Z"
                const dropoutRate = ((1 - parseFloat(successRate)) * 100).toFixed(1); // Convert to percentage

                if (!dropoutRateData[country.trim()]) {
                    dropoutRateData[country.trim()] = {};
                }
                dropoutRateData[country.trim()][year] = dropoutRate; // Store dropout per year
            });
        })
        .then(callback);
}

function updateMap(pollutant, year = document.getElementById('year').value) {
    document.getElementById('yearValue').textContent = year;
    currentPollutant = pollutant;

    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    fetch('assets/countries.geojson')
        .then(response => response.json())
        .then(geojson => {
            currentLayer = L.geoJSON(geojson, {
                style: function(feature) {
                    const data = airQualityData.filter(item => item.iso3 === feature.properties.ISO_A3 && (!item.year || item.year <= year));
                    const avgValue = data.reduce((acc, cur) => acc + cur[pollutant], 0) / data.length;
                    
                    if (data.length > 0 && !isNaN(avgValue)) {
                        return {
                            fillColor: getColor(avgValue, pollutant),
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
                        const countryName = feature.properties.ADMIN.trim();
                        const totalStudents = studentData[countryName] || 'Data not available';
                        const dropoutRate = dropoutRateData[countryName]?.[year] ? `${dropoutRateData[countryName][year]}%` : 'No data available';

                        layer.bindPopup(`
                            <strong>Country:</strong> ${countryName}<br>
                            <strong>Students:</strong> ${totalStudents}<br>
                            <strong>Dropout Rate (${year}):</strong> ${dropoutRate}
                        `).openPopup();
                    });
                }
            }).addTo(map);
        });
}

document.getElementById('year').addEventListener('input', (e) => updateMap(currentPollutant, e.target.value));

loadCSV(() => updateMap('PM2.5 (μg/m3)', 2015)); // Initial load
