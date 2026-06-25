require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- 1. MONGODB (Multi-Tenancy Schema) ----------
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const OrderSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true }, // Ye multi-tenant key hai
    customer: String,
    phone: String,
    items: String,
    total: Number,
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// ---------- 2. WHATSAPP CLIENT (Auto-start) ----------
const client = new Client({ authStrategy: new LocalAuth() });
client.on('qr', qr => { console.log('📲 Scan this QR with WhatsApp:', qr); qrcode.generate(qr, {small: true}); });
client.on('ready', () => console.log('✅ WhatsApp Client Ready!'));
client.initialize();

// ---------- 3. API ROUTES ----------
// Save Order (Har tenant ka data alag)
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ message: 'Order Saved', id: newOrder._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Orders (Sirf us tenant ke jo request kar raha hai)
app.get('/api/orders/:tenantId', async (req, res) => {
    const orders = await Order.find({ tenantId: req.params.tenantId });
    res.json(orders);
});

// ---------- 4. PDF GENERATOR & WHATSAPP SEND ----------
app.post('/api/send-receipt', async (req, res) => {
    const { phone, customer, items, total, tenantName } = req.body;
    
    // PDF Generate karo
    const doc = new PDFDocument({ size: 'A6', margin: 20 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const media = new MessageMedia('application/pdf', pdfData.toString('base64'), `Receipt_${Date.now()}.pdf`);
        
        // WhatsApp par bhejo
        const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        try {
            await client.sendMessage(formattedPhone, media);
            await client.sendMessage(formattedPhone, `🧾 *${tenantName || 'Fresh & Clean'}*\n👤 ${customer}\n💰 Total: Rs. ${total}\n✅ Thank you!`);
            res.json({ success: true, message: 'Receipt sent!' });
        } catch (err) {
            res.status(500).json({ error: 'WhatsApp error: ' + err.message });
        }
    });

    doc.fontSize(16).text(tenantName || 'Fresh & Clean Laundry', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Customer: ${customer}`);
    doc.text(`Items: ${items}`);
    doc.fontSize(14).text(`Total: Rs. ${total}`, { align: 'right' });
    doc.end();
});

// ---------- 5. SERVER START ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
