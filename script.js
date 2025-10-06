let ROCKS = new Decimal(0);
let worker_ants = new Decimal(0);
let upgradeCost = new Decimal(10);
let upgradeCount = new Decimal(0);
// tickrate in milliseconds (number)
let tickrate = 50;
let productionIntervalId = null;
// safety max to avoid runaway buys
const MAX_BUY = new Decimal('1e7');
// display mode: 'sci' or 'readable'
// displayMode now 'auto' by default: scientific only above threshold
let displayMode = 'auto';
const SCI_THRESHOLD = 1e6;



// Fonction de formatage pour les grands nombres
function formatNumber(num) {
  const sig = 3;
  if (displayMode === 'sci') {
    if (num === null || num === undefined) return (0).toExponential(sig);
    if (typeof num === 'number') return Number(num).toExponential(sig);
    try { return num.toExponential(sig); } catch (e) { try { return Number(num).toExponential(sig); } catch (e2) { return (0).toExponential(sig); } }
  }

  // auto mode: use scientific only above threshold
  if (displayMode === 'auto') {
    try {
      const n = (typeof num === 'number') ? num : (num.toNumber ? num.toNumber() : Number(num));
      if (Math.abs(n) >= SCI_THRESHOLD) return Number(n).toExponential(sig);
      // else fallthrough to readable formatting
    } catch (e) {
      // fallthrough
    }
  }

  // readable mode: use a compact human format
  if (num === null || num === undefined) return '0';
  if (typeof num === 'number') {
    if (num >= 1e6) return num.toExponential(2);
    return Math.floor(num).toString();
  }
  try {
    // Decimal -> convert to number if safe
    const n = num.toNumber ? num.toNumber() : Number(num);
    if (n >= 1e6) return n.toExponential(2);
    return Math.floor(n).toString();
  } catch (e) {
    return '0';
  }
}

// Mise à jour de l'interface
function updateUI() {
  document.getElementById("ROCKS").innerText = formatNumber(ROCKS);
  document.getElementById("worker_ants").innerText = formatNumber(worker_ants);
  document.getElementById("upgradeCost").innerText = formatNumber(upgradeCost);
  document.getElementById("autoProduction").innerText = formatNumber(worker_ants);
  // tickrate is a plain number (ms)
  document.getElementById("tickrate").innerText = tickrate.toString();
  const maxBuyEl = document.getElementById('maxBuy');
  const maxInfo = getMaxBuyAndCost();
  if (maxBuyEl) {
    maxBuyEl.innerText = maxInfo.count.toString();
  }
  const maxBuyCostEl = document.getElementById('maxBuyCost');
  if (maxBuyCostEl) {
    maxBuyCostEl.innerText = formatNumber(maxInfo.cost);
  }
  // disable Buy Max if nothing to buy
  const buyMaxBtn = document.getElementById('buyMaxBtn');
  if (buyMaxBtn) {
    if (maxInfo.count.lte(0)) buyMaxBtn.setAttribute('disabled', ''); else buyMaxBtn.removeAttribute('disabled');
  }
}

// Générer de l'énergie à la main
function gainEnergy() {
  ROCKS = ROCKS.plus(1);
  updateUI();
}

// slider
const tickslider = document.getElementById('tickSlider');
const output = document.getElementById('sliderValue');

tickslider.addEventListener('input', () => {
  // ensure tickrate is a number and update the production interval
  tickrate = Number(tickslider.value);
  output.textContent = tickrate.toString();
  // restart production interval with new tickrate
  if (productionIntervalId !== null) {
    clearInterval(productionIntervalId);
  }
  productionIntervalId = setInterval(productionTick, tickrate);
  updateUI();
});


// Acheter un améliorateur
function buyUpgrade() {
  // only allow purchase when player has enough ROCKS
  if (ROCKS.greaterThanOrEqualTo(upgradeCost)) {
    ROCKS = ROCKS.minus(upgradeCost);
    worker_ants = worker_ants.plus(1);
    upgradeCount = upgradeCount.plus(1);
    upgradeCost = upgradeCost.times(1.15).floor();
    updateUI();
  }
}

// retourne un Decimal indiquant combien on peut acheter en l'état, clamped
function getMaxBuyAndCost() {
  const baseCost = new Decimal(10);
  const multiplier = new Decimal(1.15);
  let startCost = baseCost.mul(multiplier.pow(upgradeCount));

  const result = { count: new Decimal(0), cost: new Decimal(0) };
  if (ROCKS.lessThan(startCost)) return result;
  // try affordGeometricSeries first, but validate result
  let canBuy = null;
  try {
    canBuy = Decimal.affordGeometricSeries(ROCKS, startCost, multiplier, 1).floor();
    if (canBuy.gt(MAX_BUY)) canBuy = MAX_BUY;
  } catch (e) {
    canBuy = null;
  }

  // If affordGeometricSeries failed or returned 0 while we clearly can buy at least 1,
  // fallback to a safe loop calculation.
  const safeLoop = () => {
    let count = new Decimal(0);
    let cost = startCost;
    let remaining = ROCKS;
    let total = new Decimal(0);
    const MAX_LOOP = new Decimal(100000); // safety for loop iterations
    while (remaining.greaterThanOrEqualTo(cost) && count.lt(MAX_LOOP) && count.lt(MAX_BUY)) {
      remaining = remaining.minus(cost);
      total = total.plus(cost);
      count = count.plus(1);
      cost = cost.mul(multiplier).floor();
    }
    return { count, cost: total };
  };

  if (canBuy === null || canBuy.lte(0)) {
    // either the helper failed or returned 0; use safe loop
    const res = safeLoop();
    result.count = res.count;
    result.cost = res.cost;
    return result;
  }

  // We have a candidate canBuy from helper; compute total cost and validate it.
  try {
    // compute total cost deterministically
    let total = new Decimal(0);
    let cost = startCost;
    for (let i = new Decimal(0); i.lt(canBuy); i = i.plus(1)) {
      total = total.plus(cost);
      cost = cost.mul(multiplier).floor();
    }

    // If total is greater than available ROCKS, reduce canBuy until it fits (small adjustments)
    let attempts = 0;
    while (total.greaterThan(ROCKS) && canBuy.gt(0) && attempts < 100) {
      // decrement canBuy by 1 and recompute by subtracting last cost
      canBuy = canBuy.minus(1);
      // recompute total quickly by subtracting last term
      // recalc last term
      let lastCost = startCost;
      for (let i = new Decimal(0); i.lt(canBuy); i = i.plus(1)) {
        lastCost = lastCost.mul(multiplier).floor();
      }
      total = total.minus(lastCost);
      attempts++;
    }

    if (total.greaterThan(ROCKS)) {
      // as a final fallback, use safe loop
      const res = safeLoop();
      result.count = res.count;
      result.cost = res.cost;
      return result;
    }

    result.count = canBuy;
    result.cost = total;
    return result;
  } catch (e) {
    const res = safeLoop();
    result.count = res.count;
    result.cost = res.cost;
    return result;
  }
}

// Sauvegarder les données
function saveGame() {
  const save = {
    ROCKS: ROCKS.toString(),
    worker_ants: worker_ants.toString(),
    upgradeCost: upgradeCost.toString(),
    upgradeCount: upgradeCount.toString()
  };
  localStorage.setItem("idleSave", JSON.stringify(save));
  console.log("Partie sauvegardée.");
}

// Réinitialiser la partie
function resetGame() {
  if (confirm("Réinitialiser la partie ?")) {
    localStorage.removeItem("idleSave");
    ROCKS = new Decimal(0);
    worker_ants = new Decimal(0);
    upgradeCost = new Decimal(10);
    upgradeCount = new Decimal(0);
    updateUI();
  }
}

// Chargement de la sauvegarde
function loadGame() {
  const raw = localStorage.getItem("idleSave");
  if (raw) {
    const save = JSON.parse(raw);
    ROCKS = new Decimal(save.ROCKS || 0);
    worker_ants = new Decimal(save.worker_ants || 0);
    upgradeCost = new Decimal(save.upgradeCost || 10);
    upgradeCount = new Decimal(save.upgradeCount || 0);
  }
  updateUI();
}

function buyMaxUpgrade() {
  const baseCost = new Decimal(10);
  const multiplier = new Decimal(1.15);

  const { count: canBuy, cost: totalCost } = getMaxBuyAndCost();
  if (canBuy.lte(0)) return; // nothing to buy

  // finalise l'achat
  ROCKS = ROCKS.minus(totalCost);
  upgradeCount = upgradeCount.plus(canBuy);
  upgradeCost = baseCost.mul(multiplier.pow(upgradeCount)).floor();
  worker_ants = worker_ants.plus(canBuy);
  updateUI();
}

// Initialisation après chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  // Tab switching
  function showTab(tab) {
    const prod = document.getElementById('productionTab');
    const set = document.getElementById('settingsTab');
    const credits = document.getElementById('creditsTab');
    const tabProdBtn = document.getElementById('tabProduction');
    const tabSetBtn = document.getElementById('tabSettings');
    const tabCreditsBtn = document.getElementById('tabCredits');

    // hide all first
    if (prod) prod.style.display = 'none';
    if (set) set.style.display = 'none';
    if (credits) credits.style.display = 'none';

    // remove active from all buttons
    if (tabProdBtn) tabProdBtn.classList.remove('active');
    if (tabSetBtn) tabSetBtn.classList.remove('active');
    if (tabCreditsBtn) tabCreditsBtn.classList.remove('active');

    // show selected
    if (tab === 'production') {
      if (prod) prod.style.display = '';
      if (tabProdBtn) tabProdBtn.classList.add('active');
    } else if (tab === 'settings') {
      if (set) set.style.display = '';
      if (tabSetBtn) tabSetBtn.classList.add('active');
    } else if (tab === 'credits') {
      if (credits) credits.style.display = '';
      if (tabCreditsBtn) tabCreditsBtn.classList.add('active');
    }
  }

  const tabProdBtnInit = document.getElementById('tabProduction');
  const tabSetBtnInit = document.getElementById('tabSettings');
  const tabCreditsBtnInit = document.getElementById('tabCredits');
  if (tabProdBtnInit) tabProdBtnInit.addEventListener('click', () => showTab('production'));
  if (tabSetBtnInit) tabSetBtnInit.addEventListener('click', () => showTab('settings'));
  if (tabCreditsBtnInit) tabCreditsBtnInit.addEventListener('click', () => showTab('credits'));
  // ensure initial tab
  showTab('production');
  // Attache les événements aux boutons
  document.getElementById("gainBtn").addEventListener("click", gainEnergy);
  document.getElementById("buyUpgradeBtn").addEventListener("click", buyUpgrade);
  // buy max button
  const buyMaxBtn = document.getElementById("buyMaxBtn");
  if (buyMaxBtn) buyMaxBtn.addEventListener("click", buyMaxUpgrade);
  // notation toggle
  const sciToggle = document.getElementById('sciToggle');
  if (sciToggle) {
    displayMode = sciToggle.checked ? 'auto' : 'readable';
    sciToggle.addEventListener('change', (e) => {
      displayMode = e.target.checked ? 'auto' : 'readable';
      updateUI();
    });
  }
  document.getElementById("saveBtn").addEventListener("click", saveGame);
  document.getElementById("resetBtn").addEventListener("click", resetGame);

  // Charge la sauvegarde et initialise
  loadGame();

  // Production automatique toutes les secondes
  productionIntervalId = setInterval(productionTick, tickrate);

  // Sauvegarde automatique toutes les 30 secondes
  setInterval(saveGame, 30000);
});

// production tick function (used by the interval)
function productionTick() {
  ROCKS = ROCKS.plus(worker_ants);
  updateUI();
}
