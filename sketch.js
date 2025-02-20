// Global variables for the map data
let currentPollutant = 'PM2.5';
let previousPollutant = currentPollutant;  // For detecting pollutant changes
let airQualityData = [];
let countryMapping = {}; // Mapping from TopoJSON numeric code to ISO3
let matchedCountries = {}; // For debugging
// Global for cumulative behavior
let currentSliderYear = 2015;  // Default starting slider value
let coloredCountries = {};

const width = 800, height = 600;

// Additional datasets
let studentData = [];   // from data/number-of-students.csv
let successData = [];   // from data/successrate.csv
let educationData = [];     // from data/education-index-by-country-2024.csv

// Create the SVG canvas for the globe
const svg = d3.select("#globe")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#111");

// Create an orthographic projection (3D sphere appearance)
const projection = d3.geoOrthographic()
    .scale(250)
    .translate([width / 2, height / 2])
    .rotate([0, -30]);

const path = d3.geoPath().projection(projection);
const globe = svg.append("g");

// ─── DRAG BEHAVIOR TO ROTATE THE GLOBE ─────────────────────────
svg.call(d3.drag()
  .on("drag", function(event) {
    const rotate = projection.rotate();
    const newRotate = [rotate[0] + event.dx * 0.5, rotate[1] - event.dy * 0.5];
    projection.rotate(newRotate);
    globe.selectAll("path").attr("d", path);
  })
);

// ─── LOAD THE EXTRA DATA (Students, Success Rate & Education Index) ─────
Promise.all([
    d3.csv("data/number-of-students.csv"),
    d3.csv("data/successrate.csv"),
    d3.csv("data/education-index-by-country-2024.csv")
  ]).then(([studData, succData, eduData]) => {
    studentData = studData;
    successData = succData;
    educationData = eduData;
    console.log("✅ Student Data Loaded:", studentData);
    console.log("✅ Success Data Loaded:", successData);
    console.log("✅ Education Data Loaded:", educationData);
  });
  

// ─── LOAD DATA AND DRAW THE GLOBE ────────────────────────────────
Promise.all([
    d3.json("https://unpkg.com/world-atlas@2.0.2/countries-110m.json"),
    d3.csv("data/air-quality-data.csv"),
    d3.json("data/country-codes.json")
]).then(([worldData, pollutionData, mappingData]) => {
    // Invert mapping so keys become numeric codes
    const invertedMapping = {};
    for (const [iso3, numericCode] of Object.entries(mappingData)) {
        invertedMapping[numericCode] = iso3;
    }
    countryMapping = invertedMapping;

    // Convert TopoJSON to GeoJSON
    const countries = topojson.feature(worldData, worldData.objects.countries).features;

    // Process and clean air quality data; empty "Measurement Year" becomes null.
    airQualityData = pollutionData.map(d => ({
        country: d["WHO Country Name"],
        iso3: d.ISO3,
        year: d["Measurement Year"].trim() === "" ? null : +d["Measurement Year"],
        "PM2.5": +d["PM2.5 (μg/m3)"] || 0,
        "PM10": +d["PM10 (μg/m3)"] || 0,
        "NO2": +d["NO2 (μg/m3)"] || 0
    }));

    console.log("✅ Air Quality Data Loaded:", airQualityData);

    // Draw the globe with countries and add dynamic mouse events.
    globe.selectAll("path")
        .data(countries)
        .enter().append("path")
        .attr("d", path)
        .attr("fill", "#222")  // default uncolored state
        .attr("stroke", "#444")
        .attr("stroke-width", 0.5)
        .attr("data-iso3", d => {
            const iso3 = countryMapping[d.id] || "UNKNOWN";
            if (iso3 !== "UNKNOWN") { matchedCountries[iso3] = true; }
            return iso3;
        })
        .on("mouseover", function (event, d) {
            // Highlight the country and update the info box
            d3.select(this).attr("fill", "#4CAF50");
            showCountryInfo(d);
        })
        .on("mouseout", function (event, d) {
            // Reset fill color and clear the info box
            const iso3 = countryMapping[d.id];
            if (iso3 && coloredCountries[iso3]) {
                d3.select(this).attr("fill", coloredCountries[iso3]);
            } else {
                d3.select(this).attr("fill", "#222");
            }
            clearCountryInfo();
        });

    // Initial update at default slider (2015)
    updateGlobe(currentPollutant);
    console.log("✅ Matched Countries with Data:", Object.keys(matchedCountries));
    console.log(`🔍 Total Matched Countries: ${Object.keys(matchedCountries).length}`);
});


// ─── POLLUTION COLOR SCALE FUNCTION ─────────────────────────────
function getColor(value, pollutant) {
    const colors = {
        "PM2.5": ['#800026', '#BD0026', '#E31A1C', '#FC4E2A', '#FD8D3C', '#FEB24C'],
        "PM10": ['#0B3D91', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF'],
        "NO2": ['#00441B', '#006D2C', '#238B45', '#41AB5D', '#74C476', '#A1D99B']
    };
    const ranges = [100, 75, 50, 25, 10, 0];
    return colors[pollutant][ranges.findIndex(limit => value >= limit)];
}


// ─── CUMULATIVE UPDATE FUNCTION ─────────────────────────────────
function updateGlobe(pollutant) {
    const sliderYear = +document.getElementById('year').value;
    
    if (pollutant !== previousPollutant) {
        coloredCountries = {};
        globe.selectAll("path").attr("fill", function(d) {
            const iso3 = countryMapping[d.id];
            if (!iso3) return "#222";
  
            const measurements = airQualityData.filter(item => item.iso3 === iso3);
            if (measurements.length === 0) return "#222";
  
            const validMeasurements = measurements.filter(item => item.year !== null && item.year <= sliderYear);
            let chosenMeasurement;
            if (validMeasurements.length > 0) {
                chosenMeasurement = validMeasurements.reduce((max, item) =>
                    item.year > max.year ? item : max
                );
            } else {
                const missingMeasurements = measurements.filter(item => item.year === null);
                if (missingMeasurements.length > 0) { chosenMeasurement = missingMeasurements[0]; }
            }
            
            if (chosenMeasurement && (chosenMeasurement.year === null || chosenMeasurement.year <= sliderYear)) {
                const newColor = getColor(chosenMeasurement[pollutant], pollutant);
                coloredCountries[iso3] = newColor;
                return newColor;
            } else {
                return "#222";
            }
        });
        previousPollutant = pollutant;
        currentPollutant = pollutant;
        currentSliderYear = sliderYear;
        console.log("Recalculated colors after pollutant change:", coloredCountries);
        return;
    }
    
    if (sliderYear >= currentSliderYear) {
        globe.selectAll("path").each(function(d) {
            const iso3 = countryMapping[d.id];
            if (!iso3) return;
            if (coloredCountries[iso3]) return;
  
            const measurements = airQualityData.filter(item => item.iso3 === iso3);
            if (measurements.length === 0) return;
  
            const validMeasurements = measurements.filter(item => item.year !== null && item.year <= sliderYear);
            let chosenMeasurement;
            if (validMeasurements.length > 0) {
                chosenMeasurement = validMeasurements.reduce((max, item) =>
                    item.year > max.year ? item : max
                );
            } else {
                const missingMeasurements = measurements.filter(item => item.year === null);
                if (missingMeasurements.length > 0) { chosenMeasurement = missingMeasurements[0]; }
            }
  
            if (chosenMeasurement && (chosenMeasurement.year === null || chosenMeasurement.year <= sliderYear)) {
                const newColor = getColor(chosenMeasurement[pollutant], pollutant);
                coloredCountries[iso3] = newColor;
                d3.select(this).attr("fill", newColor);
            }
        });
    } else {
        coloredCountries = {};
        globe.selectAll("path").attr("fill", function(d) {
            const iso3 = countryMapping[d.id];
            if (!iso3) return "#222";
  
            const measurements = airQualityData.filter(item => item.iso3 === iso3);
            if (measurements.length === 0) return "#222";
  
            const validMeasurements = measurements.filter(item => item.year !== null && item.year <= sliderYear);
            let chosenMeasurement;
            if (validMeasurements.length > 0) {
                chosenMeasurement = validMeasurements.reduce((max, item) =>
                    item.year > max.year ? item : max
                );
            } else {
                const missingMeasurements = measurements.filter(item => item.year === null);
                if (missingMeasurements.length > 0) { chosenMeasurement = missingMeasurements[0]; }
            }
  
            if (chosenMeasurement && (chosenMeasurement.year === null || chosenMeasurement.year <= sliderYear)) {
                const newColor = getColor(chosenMeasurement[pollutant], pollutant);
                coloredCountries[iso3] = newColor;
                return newColor;
            } else {
                return "#222";
            }
        });
    }
    currentSliderYear = sliderYear;
    updateLegend(pollutant);
    console.log("Cumulative colored countries:", coloredCountries);
}
  
// ─── SLIDER EVENT LISTENER ─────────────────────────────────────────
document.getElementById('year').addEventListener('input', () => {
    document.getElementById('yearValue').textContent = document.getElementById('year').value;
    updateGlobe(currentPollutant);
});
  
// ─── SHOW AND CLEAR COUNTRY INFORMATION ON HOVER ──────────────────
function showCountryInfo(d) {
    const countryName = d.properties.name || "Unknown";
    
    // Lookup total students
    const studentEntry = studentData.find(x =>
      x.countryLabel.trim().toLowerCase() === countryName.trim().toLowerCase()
    );
    const totalStudents = studentEntry ? studentEntry.totalStudents : "No data";
    
    // Get current year from slider
    const currentYear = document.getElementById('year').value;
    
    // Lookup success rate and calculate dropout rate
    const successEntry = successData.find(x => {
        return x.paysLabel.trim().toLowerCase() === countryName.trim().toLowerCase() &&
               new Date(x.année).getFullYear() == currentYear;
    });
    let dropoutRate;
    if (successEntry && successEntry.tauxDeReussite) {
        const taux = parseFloat(successEntry.tauxDeReussite);
        dropoutRate = ((1 - taux) * 100).toFixed(1) + "%";
    } else {
        dropoutRate = "No data";
    }
    
    // Lookup Education Index for 2020 (using the relevant column)
    // Adjust the column name if needed; here we use "EducationIndex_EducationIndex_2020"
    const eduEntry = educationData.find(x =>
      x.country.trim().toLowerCase() === countryName.trim().toLowerCase()
    );
    const educationIndex2020 = eduEntry ? eduEntry.EducationIndex_EducationIndex_2020 : "No data";
    
    // Update the info box in the right panel
    const infoDiv = document.getElementById('countryInfo');
    infoDiv.innerHTML = `<h2>${countryName}</h2>
                         <p><strong>Total Students:</strong> ${totalStudents}</p>
                         <p><strong>Dropout Rate (${currentYear}):</strong> ${dropoutRate}</p>
                         <p><strong>Education Index (2020):</strong> ${educationIndex2020}</p>`;
}

function clearCountryInfo() {
    const infoDiv = document.getElementById('countryInfo');
    infoDiv.innerHTML = `<h2>Country Information</h2>
                         <p>Hover over a country to view details.</p>`;
}

function updateLegend(pollutant) {
  const colorScales = {
    "PM2.5": ['#800026', '#BD0026', '#E31A1C', '#FC4E2A', '#FD8D3C', '#FEB24C'],
    "PM10": ['#0B3D91', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF'],
    "NO2": ['#00441B', '#006D2C', '#238B45', '#41AB5D', '#74C476', '#A1D99B']
  };
  // Fixed range thresholds (you can adjust these if needed)
  const ranges = [100, 75, 50, 25, 10, 0];
  
  let legendHtml = "<h3 style='font-size:0.8rem; margin-bottom:10px;'>Legend (" + pollutant + ")</h3>";
  // Loop through the color scale array for the current pollutant
  for (let i = 0; i < colorScales[pollutant].length; i++) {
    let label;
    if (i === 0) {
      label = "≥ " + ranges[i];
    } else if (i === colorScales[pollutant].length - 1) {
      label = "< " + ranges[i - 1];
    } else {
      label = ranges[i - 1] + " – " + ranges[i];
    }
    legendHtml += `<div style="display: flex; align-items: center; margin-bottom: 4px;">
      <div style="width: 20px; height: 20px; background: ${colorScales[pollutant][i]}; margin-right: 5px;"></div>
      <span style="font-size:0.7rem;">${label}</span>
    </div>`;
  }
  
  document.getElementById('legend').innerHTML = legendHtml;
}
