document.addEventListener('DOMContentLoaded', function() {
    const csvUrl = 'data.csv';
    const geoJsonUrl = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
    let rawData = []; // All rows
    let years = [];
    let selectedYear = 'all';
    let map, geoJsonLayer, chart = null;
    let selectedCountryLayer = null; // For highlighting
    let selectedCountryName = null; // Track selected country

    // Initialize map
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Enhanced aliases: forward (CSV to GeoJSON) and reverse (GeoJSON to CSV match)
    const forwardAliases = {
        'united states': 'united states of america',
        'usa': 'united states of america',
        'us': 'united states of america',
        'russia': 'russian federation',
        'uk': 'united kingdom',
        'south korea': 'korea, republic of',
        'north korea': 'korea, democratic people\'s republic of',
        // Add more as needed
    };

    const reverseAliases = Object.fromEntries(Object.entries(forwardAliases).map(([k, v]) => [v, k]));

    // Fetch data
    Promise.all([
        fetch(csvUrl).then(res => res.text()).then(text => Papa.parse(text, {header: true, skipEmptyLines: true}).data),
        fetch(geoJsonUrl).then(res => res.json())
    ]).then(([csvData, worldGeoJson]) => {
        rawData = csvData.filter(row => row.Country && row.Year && row.GPI && !isNaN(row.GPI));
        rawData.forEach(row => {
            row.Year = row.Year.trim();
            row.GPI = parseFloat(row.GPI);
        });

        years = [...new Set(rawData.map(row => row.Year))].sort((a, b) => b.localeCompare(a));

        // Setup year dropdown if multiple years
        if (years.length > 1) {
            const yearSelect = document.getElementById('year-select');
            const filterDiv = document.getElementById('year-filter');
            filterDiv.style.display = 'block';

            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.text = 'All years';
            yearSelect.appendChild(allOption);

            years.forEach(year => {
                const opt = document.createElement('option');
                opt.value = year;
                opt.text = year;
                yearSelect.appendChild(opt);
            });

            yearSelect.addEventListener('change', () => {
                selectedYear = yearSelect.value;
                selectedCountryName = null; // Reset selection on year change
                if (selectedCountryLayer) geoJsonLayer.resetStyle(selectedCountryLayer);
                updateViews();
            });
        }

        // Group data by normalized country name (using forward aliases)
        const countryData = {}; // normalizedName -> [{year, gpi}]
        rawData.forEach(row => {
            let name = row.Country.trim().toLowerCase();
            const aliased = forwardAliases[name] || name;
            if (!countryData[aliased]) countryData[aliased] = [];
            countryData[aliased].push({year: row.Year, gpi: row.GPI});
        });

        // Latest GPI for map coloring
        const latestGpiLookup = {};
        Object.keys(countryData).forEach(normName => {
            const latest = countryData[normName].reduce((max, d) => d.year > max.year ? d : max, {year: '-1', gpi: 0});
            latestGpiLookup[normName] = latest.gpi;
        });

        // Color function
        function getColor(score) {
            return score > 80 ? '#006400' :
                   score > 70 ? '#32CD32' :
                   score > 60 ? '#90EE90' :
                   score > 50 ? '#FFFF00' :
                   score > 40 ? '#FFD700' :
                   score > 30 ? '#FF8C00' :
                                '#FF0000';
        }

        function style(feature) {
            const countryNameLower = feature.properties.name.toLowerCase();
            const score = latestGpiLookup[countryNameLower] || null;
            return {
                fillColor: score !== null ? getColor(score) : '#808080',
                weight: selectedCountryLayer === feature ? 4 : 1,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.7
            };
        }

        function highlightFeature(e) {
            const layer = e.target;
            layer.setStyle({ weight: 4, color: '#666', dashArray: '', fillOpacity: 0.9 });
            layer.bringToFront();
        }

        function resetHighlight(e) {
            if (e.target !== selectedCountryLayer) geoJsonLayer.resetStyle(e.target);
        }

        function onCountryClick(e) {
            const layer = e.target;
            const geoJsonName = layer.feature.properties.name.toLowerCase();

            // Reset previous selection
            if (selectedCountryLayer) geoJsonLayer.resetStyle(selectedCountryLayer);
            selectedCountryLayer = layer;
            highlightFeature(e);

            // Find matching country data
            const matchedNormName = geoJsonName in reverseAliases ? reverseAliases[geoJsonName] : geoJsonName;
            const dataPoints = countryData[matchedNormName] || countryData[geoJsonName];

            if (dataPoints && dataPoints.length > 0) {
                selectedCountryName = layer.feature.properties.name;
                renderCountryLineChart(dataPoints, selectedCountryName);
            } else {
                selectedCountryName = null;
                updateViews(); // Revert to default
            }
        }

        function onEachFeature(feature, layer) {
            const countryName = feature.properties.name;
            const countryLower = countryName.toLowerCase();
            const score = latestGpiLookup[countryLower] || latestGpiLookup[reverseAliases[countryLower]];
            layer.bindPopup(`<strong>${countryName}</strong><br>GPI (latest): ${score !== undefined ? score.toFixed(1) : 'No data'}`);
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click: onCountryClick
            });
        }

        geoJsonLayer = L.geoJson(worldGeoJson, {
            style: style,
            onEachFeature: onEachFeature
        }).addTo(map);

        // Legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function () {
            const div = L.DomUtil.create('div', 'info legend');
            const grades = [0, 30, 40, 50, 60, 70, 80];
            div.innerHTML = '<strong>GPI Score</strong><br>';
            for (let i = 0; i < grades.length; i++) {
                div.innerHTML += '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                    grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
            }
            div.innerHTML += '<i style="background:#808080"></i> No data';
            return div;
        };
        legend.addTo(map);

        // Initial render
        updateViews();
    }).catch(err => {
        console.error('Error:', err);
        document.getElementById('table-body').innerHTML = '<tr><td colspan="3">Error loading data.</td></tr>';
    });

    function getFilteredData() {
        if (selectedYear === 'all') return rawData;
        return rawData.filter(row => row.Year === selectedYear);
    }

    function updateViews() {
        const data = getFilteredData();
        renderTable(data);
        if (selectedCountryName) {
            // If a country is selected, keep its chart (ignore year filter for individual view)
        } else if (years.length > 1 && selectedYear === 'all') {
            renderLineChart(); // Global trends
        } else {
            renderBarChart(data);
        }
    }

    function renderCountryLineChart(points, countryName) {
        document.getElementById('chart-title').textContent = `GPI Trend for ${countryName}`;
        points.sort((a, b) => a.year.localeCompare(b.year));

        const labels = points.map(p => p.year);
        const dataValues = points.map(p => p.gpi);

        const ctx = document.getElementById('gpi-chart').getContext('2d');
        if (chart) chart.destroy();

        chart = new Chart(ctx, {
            type: points.length > 1 ? 'line' : 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'GPI Score',
                    data: dataValues,
                    backgroundColor: points.length > 1 ? 'rgba(54, 162, 235, 0.2)' : 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    fill: points.length > 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }

    function renderTable(dataToRender) {
        const tbody = document.getElementById('table-body');
        const searchInput = document.getElementById('search-input');
        let currentData = [...dataToRender];

        // Search
        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase();
            currentData = (selectedYear === 'all' ? rawData : dataToRender).filter(row => row.Country.toLowerCase().includes(query));
            renderTableBody(currentData);
        };

        // Sortable headers
        document.querySelectorAll('#gpi-table th').forEach((th, i) => {
            th.onclick = () => {
                const keys = ['Country', 'GPI', 'Year'];
                const key = keys[i];
                currentData.sort((a, b) => {
                    const va = key === 'GPI' ? a[key] : a[key];
                    const vb = key === 'GPI' ? b[key] : b[key];
                    return va > vb ? -1 : (va < vb ? 1 : 0);
                });
                renderTableBody(currentData);
            };
        });

        renderTableBody(currentData);
    }

    function renderTableBody(dataToRender) {
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = dataToRender.map(row => `
            <tr>
                <td>${row.Country}</td>
                <td>${row.GPI.toFixed(1)}</td>
                <td>${row.Year}</td>
            </tr>
        `).join('');
    }

    function renderBarChart(dataToRender) {
        document.getElementById('chart-title').textContent = selectedYear === 'all' ? 'Top 20 Countries (Latest Year)' : `Top 20 Countries (${selectedYear})`;
        const top20 = dataToRender
            .sort((a, b) => b.GPI - a.GPI)
            .slice(0, 20);

        const ctx = document.getElementById('gpi-chart').getContext('2d');
        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top20.map(r => r.Country),
                datasets: [{ label: 'GPI Score', data: top20.map(r => r.GPI), backgroundColor: 'rgba(54, 162, 235, 0.6)' }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    function renderLineChart() {
        document.getElementById('chart-title').textContent = 'GPI Trends Over Time (Top 10 Countries by Latest GPI)';

        // Group by country, find latest GPI for ranking
        const countryData = {};
        rawData.forEach(row => {
            const name = row.Country.trim();
            if (!countryData[name]) countryData[name] = [];
            countryData[name].push({ year: row.Year, gpi: row.GPI });
        });

        // Sort countries by latest GPI
        const sortedCountries = Object.keys(countryData).sort((a, b) => {
            const latestA = Math.max(...countryData[a].map(d => d.gpi));
            const latestB = Math.max(...countryData[b].map(d => d.gpi));
            return latestB - latestA;
        }).slice(0, 10);

        const datasets = sortedCountries.map(country => {
            const points = countryData[country].sort((a, b) => a.year.localeCompare(b.year));
            return {
                label: country,
                data: points.map(p => p.gpi),
                borderColor: `rgba(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255}, 1)`,
                fill: false
            };
        });

        const labels = years.slice().reverse(); // oldest to newest

        const ctx = document.getElementById('gpi-chart').getContext('2d');
        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }
});