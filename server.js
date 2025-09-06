// Filename: server.js
// This is the complete, production-ready version of the Bokun proxy server.
// It includes all necessary headers, error handling, and logic.

// --- Step 1: Import necessary packages ---
// We use 'express' to create the server and 'node-fetch' to communicate with the Bokun API.
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Step 2: Configure your Bokun API credentials ---
// IMPORTANT: Replace these placeholders with your actual keys from the Bokun dashboard.
// Ensure the key has permissions to both read and write bookings.
const BOKUN_ACCESS_KEY = process.env.BOKUN_ACCESS_KEY || '8737ae959dc542ccaae4308d4c1da80e';
const BOKUN_SECRET_KEY = process.env.BOKUN_SECRET_KEY || 'cefc9857bf764046931ff73a6fe1514a';
const BOKUN_API_URL = 'https://api.bokun.io';

// --- Step 3: Set up CORS (Cross-Origin Resource Sharing) ---
// This allows your kiosk webpage to securely make requests to this server.
app.use((req, res, next) => {
    // List of URLs that are allowed to connect.
    const allowedOrigins = ['http://kiosk.seatripsreykjavik.com', 'http://localhost', 'http://127.0.0.1'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// --- Step 4: Define the main API endpoint ---
// This is the heart of the server. It listens for requests from the kiosk.
app.get('/api/booking/:bookingRef', async (req, res) => {
    const { bookingRef } = req.params;

    if (!bookingRef) {
        return res.status(400).json({ error: 'Booking reference is required' });
    }

    try {
        // --- Part A: Find the booking by its reference number ---
        const findUrl = `${BOKUN_API_URL}/booking/find-by-reference/${bookingRef}`;
        console.log(`\n1. Attempting to find booking: ${bookingRef}`);

        // These headers are critical for authenticating with the Bokun API.
        const apiHeaders = {
            'Accept': 'application/json', // We must ask for JSON data
            'Content-Type': 'application/json',
            'X-Bokun-AccessKey': BOKUN_ACCESS_KEY,
            'X-Bokun-SecretKey': BOKUN_SECRET_KEY,
        };

        const findResponse = await fetch(findUrl, { method: 'GET', headers: apiHeaders });

        // If the response is not "OK" (e.g., 404 Not Found, 403 Forbidden), stop here.
        if (!findResponse.ok) {
            console.error(`Error finding booking. Bokun API responded with Status: ${findResponse.status}`);
            return res.status(findResponse.status).json({ error: 'Booking not found or API key is invalid.' });
        }

        const bookingDetails = await findResponse.json();
        console.log(`   - Success: Found booking for ${bookingDetails.passengers[0].firstName} ${bookingDetails.passengers[0].lastName}`);

        // --- Part B: Mark all participants as "ARRIVED" ---
        const participantIds = bookingDetails.passengers.map(p => p.id);
        const updateUrl = `${BOKUN_API_URL}/booking/update-participant-statuses`;
        const updateBody = {
            bookingId: bookingDetails.id,
            participantIds: participantIds,
            status: "ARRIVED"
        };
        
        console.log(`2. Attempting to mark ${participantIds.length} participant(s) as ARRIVED...`);
        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify(updateBody)
        });

        if (!updateResponse.ok) {
            console.error(`   - Error: Could not update status. Bokun API responded with Status: ${updateResponse.status}`);
            // We still continue and show the boarding pass, but log the error.
        } else {
            console.log(`   - Success: Participants marked as ARRIVED.`);
        }
        
        // --- Part C: Format and send the data back to the kiosk ---
        const mainPassenger = bookingDetails.passengers[0];
        const activity = bookingDetails.activities[0];

        const formattedData = {
            experienceName: activity.title,
            date: new Date(activity.startTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: new Date(activity.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            bookingRef: bookingDetails.bookingRef,
            customerName: `${mainPassenger.firstName} ${mainPassenger.lastName}`,
            pax: bookingDetails.passengers.length,
        };

        console.log(`3. Sending boarding pass data to the kiosk.`);
        res.json(formattedData);

    } catch (error) {
        console.error('An unexpected internal server error occurred:', error);
        res.status(500).json({ error: 'An internal error occurred on the server.' });
    }
});

// --- Step 5: Start the server ---
app.listen(PORT, () => {
    console.log(`Bokun proxy server listening on port ${PORT}`);
    console.log('Ready to receive check-in requests...');
});

