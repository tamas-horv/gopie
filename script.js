// script.js
document.addEventListener('DOMContentLoaded', function() {
    const csvUrl = 'data.csv'; // Link to your CSV file in the repo
    let data = []; // Store parsed data
    let chart = null;

    // Parse CSV
    Papa.parse(csvUrl, {
        download: true,
        header: true,
        complete: function(results) {
            data = results.data.filter(row => row.Country && row.GPI && !isNaN(row.GPI)); // Filter valid rows
            if (data.length > 0) {
                renderTable(data);
                renderChart(data);
            } else {
                document.getElementById('table-body').innerHTML = '<tr><td colspan="3">No data available. Check data.csv.</td></tr>';
            }
        }
    });

    // Render sortable table
    function renderTable(dataToRender) {
        const tbody = document.getElementById('table-body');
        const searchInput = document.getElementById('search-input');
        let currentData = [...dataToRender];

        // Search functionality
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            currentData = data.filter(row => row.Country.toLowerCase().includes(query));
            renderTableBody(currentData);
        });

        // Sort table
        document.querySelectorAll('#gpi-table th').forEach(th => {
            th.addEventListener('click', () => {
                const index = Array.from(th.parentNode.children).indexOf(th);
                const key = Object.keys(data[0])[index];
                currentData.sort((a, b) => {
                    const valA = parseFloat(a[key]) || a[key];
                    const valB = parseFloat(b[key]) || b[key];
                    return valA > valB ? -1 : 1; // Descending by default
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

    // Render bar chart for top 20
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
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
});