const INVENTORY = [
	{
		id: "reed-shade-awning",
		asset: "⛺",
		name: "Reed Shade Awning",
		description: "Keeps your tiny market stall cool on sunny study sessions.",
		price: 24
	},
	{
		id: "river-stone-lamp",
		asset: "🏮",
		name: "River Stone Lamp",
		description: "A warm glow to guide bibins through twilight planning.",
		price: 31
	},
	{
		id: "pine-resin-seal",
		asset: "🧪",
		name: "Pine Resin Seal",
		description: "Waterproofs dam notes and keeps all plans tidy.",
		price: 18
	},
	{
		id: "mossy-signboard",
		asset: "🪧",
		name: "Mossy Signboard",
		description: "Paint reminders and pin your current focus topic.",
		price: 22
	},
	{
		id: "acorn-ledger",
		asset: "📘",
		name: "Acorn Ledger",
		description: "Records each successful session and earned lumber.",
		price: 16
	},
	{
		id: "birch-bench",
		asset: "🪑",
		name: "Birch Bench",
		description: "A comfy seat for long reading runs without drift.",
		price: 35
	},
	{
		id: "waterwheel-toy",
		asset: "⚙️",
		name: "Waterwheel Toy",
		description: "Spins whenever you finish a distraction-free block.",
		price: 27
	},
	{
		id: "cedar-crate",
		asset: "🧺",
		name: "Cedar Crate",
		description: "Storage for all your mini tools and fresh ideas.",
		price: 20
	},
	{
		id: "berry-tea-kit",
		asset: "🍵",
		name: "Berry Tea Kit",
		description: "Brew focus tea while tackling dense textbook pages.",
		price: 14
	},
	{
		id: "glacier-map",
		asset: "🗺️",
		name: "Glacier Map",
		description: "Chart your goals for the week with a clear route.",
		price: 29
	}
];

const reservePill = document.getElementById("reservePill");
const itemsGrid = document.getElementById("itemsGrid");
const itemCardTemplate = document.getElementById("itemCardTemplate");

let lumberReserve = 0;
let purchasedMap = {};

function sendRuntimeMessage(payload) {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage(payload, (response) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve(response || {});
		});
	});
}

function updateReserveLabel() {
	reservePill.textContent = `lumberReserve: ${lumberReserve}`;
}

function createCard(item, index) {
	const node = itemCardTemplate.content.firstElementChild.cloneNode(true);
	node.style.animationDelay = `${index * 40}ms`;

	node.querySelector("[data-asset]").textContent = item.asset;
	node.querySelector("[data-name]").textContent = item.name;
	node.querySelector("[data-description]").textContent = item.description;

	const purchaseBtn = node.querySelector("[data-purchase]");
	const ownedCount = purchasedMap[item.id]?.quantity || 0;

	if (ownedCount > 0) {
		node.classList.add("purchased");
	}

	if (ownedCount > 0) {
		purchaseBtn.textContent = `Purchase ${item.price} lumber (Owned x${ownedCount})`;
	} else {
		purchaseBtn.textContent = `Purchase ${item.price} lumber`;
	}

	if (item.price > lumberReserve) {
		purchaseBtn.disabled = true;
	}

	purchaseBtn.addEventListener("click", async () => {
		purchaseBtn.disabled = true;
		purchaseBtn.textContent = "Purchasing...";
		node.classList.remove("failed");

		try {
			const result = await sendRuntimeMessage({
				action: "storePurchaseItem",
				item: {
					id: item.id,
					name: item.name,
					asset: item.asset,
					description: item.description,
					price: item.price
				}
			});

			if (!result.success) {
				node.classList.add("failed");
				const reason = result.reason || "Not enough lumber";
				purchaseBtn.textContent = reason;
				setTimeout(() => renderStore(), 1000);
				return;
			}

			lumberReserve = result.lumberReserve;
			purchasedMap = result.purchasedItems || purchasedMap;
			renderStore();
		} catch (err) {
			console.error("Failed to purchase item", err);
			node.classList.add("failed");
			purchaseBtn.textContent = "Store unavailable";
			setTimeout(() => renderStore(), 1000);
		}
	});

	return node;
}

function renderStore() {
	updateReserveLabel();
	itemsGrid.innerHTML = "";

	INVENTORY.forEach((item, index) => {
		itemsGrid.appendChild(createCard(item, index));
	});
}

async function initStore() {
	try {
		const reserveRes = await sendRuntimeMessage({ action: "storeGetLumberReserve" });
		const purchasedRes = await sendRuntimeMessage({ action: "storeGetPurchasedItems" });

		lumberReserve = Number.isInteger(reserveRes.lumberReserve) ? reserveRes.lumberReserve : 0;
		purchasedMap = purchasedRes.purchasedItems || {};
	} catch (err) {
		console.error("Failed to initialize store", err);
		lumberReserve = 0;
		purchasedMap = {};
	}

	renderStore();
}

initStore();
