const { Order, ORDER_STATUS } = require("../../models/orderSchema");

const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

exports.getDateRange = (startDate, endDate) => {
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

exports.viewSalesReport = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      paymentMethod = "all",
      orderStatus = "all",
      page = 1,
      limit = 10,
    } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.max(1, Math.min(parseInt(limit) || 10, 100));
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString().split("T")[0];
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
    }
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const query = {
      createdAt: { $gte: start, $lte: end },
      orderStatus: { $in: ["Delivered", "Return Rejected", "Return Requested"] },
    };
    if (orderStatus !== "all") query.orderStatus = orderStatus;
    if (paymentMethod !== "all") query.paymentMethod = paymentMethod;

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    if (page > totalPages) page = totalPages || 1;

    const orders = await Order.find(query)
      .populate("user", "name email")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const allOrders = await Order.find(query).lean();
    const totalSales = allOrders.reduce((sum, order) => {
      const activeItems = order.items ? order.items.filter(item => 
        item.status !== 'Cancelled' && 
        item.status !== 'Returned' && 
        item.status !== 'Return Approved'
      ) : [];
      
      const currentItemsTotal = activeItems.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
      const currentCouponDiscount = order.couponDiscount || 0;
      const currentBalance = currentItemsTotal - currentCouponDiscount + (order.deliveryCharge || 0);
      
      return sum + currentBalance;
    }, 0);
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const allOrdersInDateRange = await Order.find({
      createdAt: { $gte: start, $lte: end },
      orderStatus: { $in: ["Delivered", "Return Rejected", "Return Approved"] },
    }).lean();
    const returnedOrders = allOrdersInDateRange.filter(
      (order) => order.orderStatus === "Return Approved"
    );
    const returnRate =
      allOrdersInDateRange.length > 0
        ? ((returnedOrders.length / allOrdersInDateRange.length) * 100).toFixed(
            1
          )
        : 0;
    const returnedOrdersCount = returnedOrders.length;

    const processedOrders = orders.map((order) => ({
      ...order,
      totalAmount: order.totalAmount || 0,
      items: order.items || [],
      user: order.user || { name: "N/A", email: "N/A" },
    }));

    const baseUrl = "/admin/sales-report";
    const queryParams = new URLSearchParams({
      startDate,
      endDate,
      paymentMethod,
      orderStatus,
    });
    const queryString = queryParams.toString();
    const paginationBaseUrl = `${baseUrl}?`;
    const maxVisiblePages = 5;
    let startPage = Math.max(
      1,
      Math.min(
        page - Math.floor(maxVisiblePages / 2),
        totalPages - (maxVisiblePages - 1)
      )
    );
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    const showStartEllipsis = startPage > 1;
    const showEndEllipsis = endPage < totalPages;

    res.render("admin/sales-report", {
      title: "Sales Report",
      orders: processedOrders,
      totalSales,
      totalOrders,
      averageOrderValue,
      returnRate,
      returnedOrdersCount,
      startDate,
      endDate,
      currentPage: page,
      totalPages,
      filters: { startDate, endDate, paymentMethod, orderStatus },
      paginationBaseUrl,
      queryString,
      startPage,
      endPage,
      showStartEllipsis,
      showEndEllipsis,
      path: "/admin/sales-report",
    });
  } catch (error) {
    res
      .status(500)
      .render("admin/error", { message: "Error generating sales report", error });
  }
};

exports.getSalesReportData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const { startDate, endDate, paymentMethod } = req.query;

    let query = {
      orderStatus: { $in: ["Delivered", "Return Rejected", "Return Requested"] },
    };

    if (startDate && endDate) {
      const dateRange = exports.getDateRange(startDate, endDate);
      query.createdAt = {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }
    if (paymentMethod && paymentMethod !== "all") {
      query.paymentMethod = paymentMethod;
    }
    if (orderStatus && orderStatus !== "all") {
      query.orderStatus = orderStatus;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

    const totalRevenue = orders.reduce((sum, order) => {
      const activeItems = order.items ? order.items.filter(item => 
        item.status !== 'Cancelled' && 
        item.status !== 'Returned' && 
        item.status !== 'Return Approved'
      ) : [];
      
      const currentItemsTotal = activeItems.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
      const currentCouponDiscount = order.couponDiscount || 0;
      const currentBalance = currentItemsTotal - currentCouponDiscount + (order.deliveryCharge || 0);
      
      return sum + currentBalance;
    }, 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          totalPages: Math.ceil(total / limit),
          total,
        },
        stats: {
          totalRevenue,
          totalOrders,
          averageOrderValue,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to get sales report data" });
  }
};

exports.exportSalesReportPDF = async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, orderStatus } = req.query;

    let query = {
      orderStatus: { $in: ["Delivered", "Return Rejected", "Return Requested"] },
    };

    if (startDate && endDate) {
      const dateRange = exports.getDateRange(startDate, endDate);
      query.createdAt = {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }

    if (paymentMethod && paymentMethod !== "all") {
      query.paymentMethod = paymentMethod;
    }
    if (orderStatus && orderStatus !== "all") {
      query.orderStatus = orderStatus;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .lean();

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.pdf"
    );

    doc.pipe(res);

    function drawPageBorder() {
      doc.save();
      doc.strokeColor("#000000").lineWidth(1);
      doc
        .rect(
          doc.page.margins.left,
          doc.page.margins.top,
          doc.page.width - doc.page.margins.left - doc.page.margins.right,
          doc.page.height - doc.page.margins.top - doc.page.margins.bottom
        )
        .stroke();
      doc.restore();
    }
    drawPageBorder();
    doc.on("pageAdded", drawPageBorder);

    doc.strokeColor("#cccccc").lineWidth(0.5);

    let pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc
      .font("Helvetica")
      .fontSize(20)
      .text("Sales Report", doc.page.margins.left, doc.y + 20, {
        width: pageWidth,
        align: "center",
      });
    if (orderStatus && orderStatus !== "all") {
      const subtitle =
        orderStatus === "Delivered"
          ? "Delivered Orders"
          : orderStatus + " Orders";
      doc
        .font("Helvetica")
        .fontSize(14)
        .text(subtitle, doc.page.margins.left, doc.y + 5, {
          width: pageWidth,
          align: "center",
        });
    }
    doc.moveDown(1.5);

    if (startDate && endDate) {
      doc.fontSize(10).text(`Date Range: ${startDate} to ${endDate}`);
      doc.moveDown();
    }

    const totalOrdersCount = orders.length;
    const totalRevenueAmount = orders.reduce((sum, order) => {
      const activeItems = order.items ? order.items.filter(item => 
        item.status !== 'Cancelled' && 
        item.status !== 'Returned' && 
        item.status !== 'Return Approved'
      ) : [];
      
      const currentItemsTotal = activeItems.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
      const currentCouponDiscount = order.couponDiscount || 0;
      const currentBalance = currentItemsTotal - currentCouponDiscount + (order.deliveryCharge || 0);
      
      return sum + currentBalance;
    }, 0);
    const totalDiscountAmount = orders.reduce(
      (sum, order) => sum + (order.couponDiscount || 0),
      0
    );
    doc
      .font("Helvetica")
      .fontSize(14)
      .text("Order Summary:", { underline: true });
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(`Total Orders: ${totalOrdersCount}`, { indent: 20 });
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(
        `Total Revenue: ${
          Number.isInteger(totalRevenueAmount)
            ? totalRevenueAmount
            : totalRevenueAmount.toFixed(2)
        }`,
        { indent: 20 }
      );
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(
        `Total Discount: ${
          Number.isInteger(totalDiscountAmount)
            ? totalDiscountAmount
            : totalDiscountAmount.toFixed(2)
        }`,
        { indent: 20 }
      );
    doc.moveDown();

    const pageMargin = doc.page.margins.left;
    const availableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = Math.floor(availableWidth * 0.9);
    const tableMarginX =
      pageMargin + Math.floor((availableWidth - tableWidth) / 2);
    const tableTop = doc.y + 20;
    const noWidth = 30;
    const restWidth = Math.floor(tableWidth - noWidth);
    const colWidths = {
      no: noWidth,
      orderId: Math.floor(restWidth * 0.18),
      amount: Math.floor(restWidth * 0.12),
      discount: Math.floor(restWidth * 0.12),
      finalAmount: Math.floor(restWidth * 0.14),
      status: Math.floor(restWidth * 0.12),
      username: Math.floor(restWidth * 0.13),
      paymentMethod:
        restWidth -
        (Math.floor(restWidth * 0.18) +
          Math.floor(restWidth * 0.12) +
          Math.floor(restWidth * 0.12) +
          Math.floor(restWidth * 0.14) +
          Math.floor(restWidth * 0.12) +
          Math.floor(restWidth * 0.13)),
    };

    const itemNoX = tableMarginX;
    const orderIdX = itemNoX + colWidths.no;
    const amountX = orderIdX + colWidths.orderId;
    const discountX = amountX + colWidths.amount;
    const finalAmountX = discountX + colWidths.discount;
    const statusX = finalAmountX + colWidths.finalAmount;
    const usernameX = statusX + colWidths.status;
    const paymentMethodX = usernameX + colWidths.username;
    const tableRight = tableMarginX + tableWidth;

    function drawTableHeader() {
      const headerHeight = 20;

      doc.save();
      doc
        .fillColor("#f0f0f0")
        .rect(itemNoX, tableTop, tableRight - itemNoX, headerHeight)
        .fill();
      doc.restore();
      doc.font("Helvetica").fontSize(12);
      doc.fillColor("#000000");
      doc.text("No.", itemNoX + 2, tableTop + 5, {
        width: colWidths.no - 4,
        align: "left",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Order ID", orderIdX + 2, tableTop + 5, {
        width: colWidths.orderId - 4,
        align: "left",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Amount", amountX + 2, tableTop + 5, {
        width: colWidths.amount - 4,
        align: "right",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Discount", discountX + 2, tableTop + 5, {
        width: colWidths.discount - 4,
        align: "right",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Final Amount", finalAmountX + 2, tableTop + 5, {
        width: colWidths.finalAmount - 4,
        align: "right",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Status", statusX + 2, tableTop + 5, {
        width: colWidths.status - 4,
        align: "left",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Username", usernameX + 2, tableTop + 5, {
        width: colWidths.username - 4,
        align: "left",
        ellipsis: true,
        lineBreak: false,
      });
      doc.text("Payment Method", paymentMethodX + 2, tableTop + 5, {
        width: colWidths.paymentMethod - 4,
        align: "center",
        ellipsis: true,
        lineBreak: false,
      });
      doc
        .strokeColor("#000000")
        .lineWidth(1)
        .moveTo(itemNoX, tableTop + headerHeight)
        .lineTo(tableRight, tableTop + headerHeight)
        .stroke();
      doc.strokeColor("#cccccc").lineWidth(0.5);
    }
    drawTableHeader();
    doc.font("Helvetica").fontSize(12);

    const rowHeight = 20;
    let rowY = tableTop + 20;
    orders.forEach((order, i) => {
      if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawTableHeader();
        doc.font("Helvetica").fontSize(12);
        rowY = tableTop + 20;
      }
      const activeItems = order.items ? order.items.filter(item => 
        item.status !== 'Cancelled' && 
        item.status !== 'Returned' && 
        item.status !== 'Return Approved'
      ) : [];
      
      const itemsTotal = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discountValue = order.couponDiscount || 0;
      const deliveryCharge = order.deliveryCharge || 0;
      const amountValue = itemsTotal;
      const finalValue = itemsTotal - discountValue + deliveryCharge;
      const username =
        (order.user && order.user.name) ||
        (order.user && order.user.email) ||
        "N/A";
      const methodMap = { cod: "COD", razorpay: "Razorpay", wallet: "Wallet" };
      const paymentMethodText =
        methodMap[order.paymentMethod] || order.paymentMethod || "N/A";
      doc.rect(itemNoX, rowY, colWidths.no, rowHeight).stroke();
      doc.text(i + 1, itemNoX + 2, rowY + 5, {
        width: colWidths.no - 4,
        height: rowHeight - 4,
        align: "left",
        ellipsis: true,
      });
      doc.rect(orderIdX, rowY, colWidths.orderId, rowHeight).stroke();
      doc.text(
        `#${order._id.toString().slice(-8).toUpperCase()}`,
        orderIdX + 2,
        rowY + 5,
        { width: colWidths.orderId - 4, height: rowHeight - 4, ellipsis: true }
      );
      doc.rect(amountX, rowY, colWidths.amount, rowHeight).stroke();
      doc.text(
        `${
          Number.isInteger(amountValue) ? amountValue : amountValue.toFixed(2)
        }`,
        amountX + 2,
        rowY + 5,
        {
          width: colWidths.amount - 4,
          height: rowHeight - 4,
          align: "right",
          ellipsis: true,
          lineBreak: false,
        }
      );
      doc.rect(discountX, rowY, colWidths.discount, rowHeight).stroke();
      doc.text(
        `${
          Number.isInteger(discountValue)
            ? discountValue
            : discountValue.toFixed(2)
        }`,
        discountX + 2,
        rowY + 5,
        {
          width: colWidths.discount - 4,
          height: rowHeight - 4,
          align: "right",
          ellipsis: true,
          lineBreak: false,
        }
      );
      doc.rect(finalAmountX, rowY, colWidths.finalAmount, rowHeight).stroke();
      doc.text(
        `${Number.isInteger(finalValue) ? finalValue : finalValue.toFixed(2)}`,
        finalAmountX + 2,
        rowY + 5,
        {
          width: colWidths.finalAmount - 4,
          height: rowHeight - 4,
          align: "right",
          ellipsis: true,
          lineBreak: false,
        }
      );
      doc.rect(statusX, rowY, colWidths.status, rowHeight).stroke();
      doc.text(order.orderStatus || order.status, statusX + 2, rowY + 5, {
        width: colWidths.status - 4,
        height: rowHeight - 4,
        align: "left",
        ellipsis: true,
      });
      doc.rect(usernameX, rowY, colWidths.username, rowHeight).stroke();
      doc.text(username, usernameX + 2, rowY + 5, {
        width: colWidths.username - 4,
        height: rowHeight - 4,
        align: "left",
        ellipsis: true,
      });
      doc
        .rect(paymentMethodX, rowY, colWidths.paymentMethod, rowHeight)
        .stroke();
      doc.text(paymentMethodText, paymentMethodX + 2, rowY + 5, {
        width: colWidths.paymentMethod - 4,
        height: rowHeight - 4,
        align: "center",
        ellipsis: true,
      });
      rowY += rowHeight;
    });

    const tableBottom = rowY;
    const tableLeft = tableMarginX;

    doc.strokeColor("#000000").lineWidth(1);
    doc
      .rect(tableLeft, tableTop, tableRight - tableLeft, tableBottom - tableTop)
      .stroke();
    [
      itemNoX,
      orderIdX,
      amountX,
      discountX,
      finalAmountX,
      statusX,
      usernameX,
      paymentMethodX,
      tableRight,
    ].forEach((x) => {
      doc.moveTo(x, tableTop).lineTo(x, tableBottom).stroke();
    });

    doc.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to export sales report as PDF",
    });
  }
};

exports.exportSalesReportExcel = async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, orderStatus } = req.query;
    let query = { orderStatus: { $in: ["Delivered", "Return Rejected", "Return Requested"] } };

    if (startDate && endDate) {
      const dateRange = exports.getDateRange(startDate, endDate);
      query.createdAt = {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }

    if (paymentMethod && paymentMethod !== "all") {
      query.paymentMethod = paymentMethod;
    }
    if (orderStatus && orderStatus !== "all") {
      query.orderStatus = orderStatus;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("items.product", "name")
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 20 },
      { header: "Date", key: "date", width: 20 },
      { header: "Customer", key: "customer", width: 25 },
      { header: "Items", key: "items", width: 30 },
      { header: "Payment Method", key: "paymentMethod", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Discount", key: "discount", width: 15 },

      { header: "Final Amount", key: "finalAmount", width: 15 },
    ];

    orders.forEach((order) => {
      const itemsDesc =
        order.items && order.items.length
          ? order.items
              .map(
                (item) =>
                  (item.product && item.product.name
                    ? item.product.name
                    : "Unknown") +
                  " x " +
                  item.quantity
              )
              .join(", ")
          : "";
      const activeItems = order.items ? order.items.filter(item => 
        item.status !== 'Cancelled' && 
        item.status !== 'Returned' && 
        item.status !== 'Return Approved'
      ) : [];
      
      const itemsTotal = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discountValue = order.couponDiscount || 0;
      const deliveryCharge = order.deliveryCharge || 0;
      const finalValue = itemsTotal - discountValue + deliveryCharge;

      worksheet.addRow({
        orderId: "#" + order._id.toString().slice(-8).toUpperCase(),
        date: order.createdAt,
        customer: order.user ? order.user.email || order.user.name : "N/A",
        items: itemsDesc,
        paymentMethod: order.paymentMethod || "",
        status: order.orderStatus || order.status,
        totalAmount: itemsTotal,
        discount: discountValue,

        finalAmount: finalValue,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sales-report.xlsx"'
    );
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to export Excel" });
  }
};
