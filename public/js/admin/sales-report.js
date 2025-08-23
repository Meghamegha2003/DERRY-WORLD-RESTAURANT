// Format dates as YYYY-MM-DD
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

$(document).ready(function() {
    const $cardBody = $('.card-body');
    
    // Get data from server if available
    const serverStartDate = $cardBody.data('start-date');
    const serverEndDate = $cardBody.data('end-date');
    const reportData = $cardBody.data('report-data');
    
    // Set dates from server or use default (last 30 days)
    if (serverStartDate) {
        $('#startDate').val(serverStartDate);
    } else {
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        $('#startDate').val(formatDate(defaultStartDate));
    }
    
    if (serverEndDate) {
        $('#endDate').val(serverEndDate);
    } else {
        $('#endDate').val(formatDate(new Date()));
    }

    // Export to Excel
    $('#exportExcel').on('click', function(e) {
        e.preventDefault();
        const start = $('#startDate').val();
        const end = $('#endDate').val();
        if (start && end) {
            window.location.href = '/admin/sales-report/export/excel?startDate=' + start + '&endDate=' + end;
        } else {
            alert('Please select both start and end dates');
        }
    });

    // Export to PDF
    $('#exportPdf').on('click', function(e) {
        e.preventDefault();
        const start = $('#startDate').val();
        const end = $('#endDate').val();
        if (start && end) {
            window.location.href = '/admin/sales-report/export/pdf?startDate=' + start + '&endDate=' + end;
        } else {
            alert('Please select both start and end dates');
        }
    });

    // Initialize DataTable if report data exists
    if (reportData && reportData.length > 0) {
        $('#salesReportTable').DataTable({
            dom: 'Bfrtip',
            buttons: [
                'copy', 'csv', 'excel', 'pdf', 'print'
            ],
            order: [[1, 'desc']],
            pageLength: 25,
            responsive: true
        });
    }
});
