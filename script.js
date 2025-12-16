document.addEventListener('DOMContentLoaded', function() {
    const csvUrl = 'data.csv';
    const geoJsonUrl = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json'; // Low-res world GeoJSON
    let data = [];
    let map;
    let geoJsonLayer;
    let chart = null;

    // Initialize map
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Fetch CSV and GeoJSON in parallel
    Promise.all([
        fetch(csvUrl).then(res => res.text()).then(text => Papa.parse(text, {header: true, skipEmptyLines: true}).data),
        fetch(geoJsonUrl).then(res => res.json())
    ]).then(([csvData, worldGeoJson]) => {
        data = csvData.filter(row => row.Country && row.GPI && !isNaN(row.GPI));

        // Create GPI lookup (normalize country names)
        const gpiLookup = {};
        const aliases = {
            'united states': 'united states of america',
            'usa': 'united states of america',
            'us': 'united states of america',
            'united states of america': 'united states of america', // self
            'russia': 'russian federation',
            'russian federation': 'russian federation',
            'uk': 'united kingdom',
            'united kingdom': 'united kingdom',
            // Add more as needed, e.g., 'south korea': 'korea, republic of'
        };
        data.forEach(row => {
            let name = row.Country.trim().toLowerCase();
            // Apply alias if exists
            if (aliases[name]) {
                name = aliases[name];
            }
            gpiLookup[name] = parseFloat(row.GPI);
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

        // Style function
        function style(feature) {
            const countryNameLower = feature.properties.name.toLowerCase();
            const effectiveName = aliases[countryNameLower] || countryNameLower;
            const score = gpiLookup[effectiveName] || null;
            return {
                fillColor: score !== null ? getColor(score) : '#808080',
                weight: 1,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.7
            };
        }

        // Hover/click handlers
        function highlightFeature(e) {
            const layer = e.target;
            layer.setStyle({
                weight: 3,
                color: '#666',
                dashArray: '',
                fillOpacity: 0.9
            });
            layer.bringToFront();
        }

        function resetHighlight(e) {
            geoJsonLayer.resetStyle(e.target);
        }

        function onEachFeature(feature, layer) {
            const countryNameLower = feature.properties.name.toLowerCase();
            const effectiveName = aliases[countryNameLower] || countryNameLower; // Optional: reverse alias if needed
            const score = gpiLookup[effectiveName];
            layer.bindPopup(`<strong>${countryNameLower}</strong><br>GPI: ${score !== undefined ? score.toFixed(1) : 'No data'}`);
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click: highlightFeature
            });
        }

        // Add GeoJSON layer
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
                div.innerHTML +=
                    '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                    grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
            }
            div.innerHTML += '<i style="background:#808080"></i> No data';
            return div;
        };
        legend.addTo(map);

        // Now render table and chart
        renderTable(data);
        renderChart(data);
    }).catch(err => {
        console.error('Error loading data:', err);
        document.getElementById('table-body').innerHTML = '<tr><td colspan="3">Error loading data.</td></tr>';
    });

    // Table rendering (same as before, with search/sort)
    function renderTable(dataToRender) {
        const tbody = document.getElementById('table-body');
        const searchInput = document.getElementById('search-input');
        let currentData = [...dataToRender];

        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            currentData = data.filter(row => row.Country.toLowerCase().includes(query));
            renderTableBody(currentData);
        });

        document.querySelectorAll('#gpi-table th').forEach(th => {
            th.addEventListener('click', () => {
                const index = Array.from(th.parentNode.children).indexOf(th);
                const key = ['Country', 'GPI', 'Year'][index];
                currentData.sort((a, b) => {
                    const valA = key === 'GPI' ? parseFloat(a[key]) : a[key];
                    const valB = key === 'GPI' ? parseFloat(b[key]) : b[key];
                    return valA > valB ? -1 : 1;
                });
                renderTableBody(currentData);
            });
        });

        renderTableBody(currentData);
    }

    function renderTableBody(dataToRender) {
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = dataToRender.map(row => `
            <tr>
                <td>${row.Country}</td>
                <td>${parseFloat(row.GPI).toFixed(1)}</td>
                <td>${row.Year || 'N/A'}</td>
            </tr>
        `).join('');
    }

    function renderChart(dataToRender) {
        const ctx = document.getElementById('gpi-chart').getContext('2d');
        const top20 = dataToRender
            .sort((a, b) => parseFloat(b.GPI) - parseFloat(a.GPI))
            .slice(0, 20);

        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top20.map(row => row.Country),
                datasets: [{
                    label: 'GPI Score',
                    data: top20.map(row => parseFloat(row.GPI)),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    }
});