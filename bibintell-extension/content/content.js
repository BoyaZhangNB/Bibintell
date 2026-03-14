console.log("🪵 Bibin's eyes are open. Looking for leaks...");

async function checkCurrentPage() {
    // 1. Fetch the actual Dam Session topic your friend saved
    chrome.storage.local.get(["studySubject"], async (data) => {
        const topic = data.studySubject;

        // If there is no topic saved, the user isn't in a session. Let Bibin sleep.
        if (!topic) {
            console.log("No active Dam Session. Bibin is resting.");
            return; 
        }

        console.log(`Bibin is guarding the topic: ${topic}`);

        // 2. Scrape the page data
        const pageText = document.body.innerText.substring(0, 1000); 
        const requestBody = {
            topic: topic,
            title: document.title,
            content: pageText,
            url: window.location.href
        };

        try {
            // 3. Send the data to your FastAPI backend
            const response = await fetch("http://127.0.0.1:8000/check-page", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });
            
            const result = await response.json();
            console.log("🦦 Bibin's Judgment:", result);

            // 4. React! If distracted, visually inject Bibin into the webpage.
            if (result.status === "distracted") {
                summonBibinToPage(result.bibin_reaction);
            }
            
        } catch (error) {
            console.error("Bibin's backend is unreachable:", error);
        }
    });
}

// --- VISUAL DOM INJECTION ---
function summonBibinToPage(guiltMessage) {
    // Check if Bibin is already on the page to avoid duplicates
    if (document.getElementById("bibin-overlay")) return;

    // Create a container for Bibin
    const overlay = document.createElement("div");
    overlay.id = "bibin-overlay";
    
    // ECE Tip: Force a max z-index so YouTube or Reddit can't hide him
    overlay.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #8B4513; /* Beaver Brown */
        color: white;
        padding: 20px;
        border-radius: 12px;
        border: 4px solid #D2B48C;
        z-index: 2147483647; 
        box-shadow: 0px 8px 16px rgba(0,0,0,0.5);
        font-family: 'Courier New', monospace;
        max-width: 300px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    `;

    // You can replace the emoji with your friend's actual image path later:
    // <img src="${chrome.runtime.getURL('pet/bibin_angry.png')}" width="100"/>
    overlay.innerHTML = `
        <div style="font-size: 50px; margin-bottom: 10px;">🦫</div>
        <h3 style="margin: 0 0 10px 0; color: #FFD700;">LEAK DETECTED!</h3>
        <p style="margin: 0; font-size: 14px;">${guiltMessage}</p>
    `;

    // Slap him onto the DOM
    document.body.appendChild(overlay);
}

// Run the check 3 seconds after the page loads
setTimeout(checkCurrentPage, 3000);

// Run the check every 5 seconds while there is an active topic
setInterval(checkCurrentPage, 5000);