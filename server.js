// Filename: server.js
// This version tries a new lookup endpoint and has enhanced error logging.

const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Read API credentials from environment variables ---
const BOKUN_ACCESS_KEY = process.env.8737ae959dc542ccaae4308d4c1da80e;
const BOKUN_SECRET_KEY = process.env.cefc9857bf764046931ff73a6fe1514a;
const BOKUN_API_URL = 'https://api.bokun.io';

// --- Security Check: Ensure API keys are configured ---
if (!BOKUN_ACCESS_KEY || !BOKUN_SECRET_KEY) {
    console.error("FATAL ERROR: BOKUN_ACCESS_KEY or BOKUN_SECRET_KEY is not set in the environment.");
    process.exit(1); // Stop the server if keys are missing
}

// --- Set up CORS (Cross-Origin Resource Sharing) ---
app.use((req, res, next) => {
    const allowedOrigins = ['http://kiosk.seatripsreykjavik.com', 'http://localhost', 'http://127.0.0.1'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// --- Define the main API endpoint ---
app.get('/api/booking/:bookingRef', async (req, res) => {
    const { bookingRef } = req.params;

    if (!bookingRef) {
        return res.status(400).json({ error: 'Booking reference is required' });
    }

    try {
        // --- Part A: Find the booking using a new lookup endpoint ---
        // FINAL ATTEMPT: Using a different, plausible endpoint structure.
        const findUrl = `${BOKUN_API_URL}/bookings/lookup?bookingRef=${bookingRef}`;

        console.log(`\n1. Attempting to find booking: ${bookingRef} via GET to ${findUrl}`);
        
        const apiHeaders = {
            'Accept': 'application/json',
            'X-Bokun-AccessKey': BOKUN_ACCESS_KEY,
            'X-Bokun-SecretKey': BOKUN_SECRET_KEY,
        };

        const findResponse = await fetch(findUrl, {
            method: 'GET',
            headers: apiHeaders,
        });

        if (!findResponse.ok) {
            console.error(`Error finding booking. Bokun API responded with Status: ${findResponse.status}`);
            const errorText = await findResponse.text(); // Get the full error response
            console.error("--- FULL RAW RESPONSE FROM BOKUN ---");
            console.error(errorText);
            console.error("--- END OF RESPONSE ---");
            return res.status(findResponse.status).json({ error: 'Booking not found or API endpoint is incorrect.' });
        }
        
        const searchResults = await findResponse.json();

        // The lookup endpoint should return a single object, not an array.
        if (!searchResults) {
            console.error(`   - Error: Booking reference ${bookingRef} not found.`);
            return res.status(404).json({ error: 'Booking not found.' });
        }

        const bookingDetails = searchResults; // Assuming it returns a single booking
        console.log(`   - Success: Found booking for ${bookingDetails.passengers[0].firstName} ${bookingDetails.passengers[0].lastName}`);

        // --- Part B: Mark all participants as "ARRIVED" ---
        const participantIds = bookingDetails.passengers.map(p => p.id);
        const updateUrl = `${BOKUN_API_URL}/booking/update-participant-statuses`;
        const updateBody = {
            bookingId: bookingDetails.id,
            participantIds: participantIds,
            status: "ARRIVED"
        };
        
        const postApiHeaders = { ...apiHeaders, 'Content-Type': 'application/json' };
        
        console.log(`2. Attempting to mark ${participantIds.length} participant(s) as ARRIVED...`);
        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: postApiHeaders,
            body: JSON.stringify(updateBody)
        });

        if (!updateResponse.ok) {
            console.error(`   - Error: Could not update status. Bokun API responded with Status: ${updateResponse.status}`);
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

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Bokun proxy server listening on port ${PORT}`);
    console.log('Ready to receive check-in requests...');
});

