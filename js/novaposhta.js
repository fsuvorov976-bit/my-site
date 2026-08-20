// js/novaposhta.js

let selectedCityRef = 'db5c8890-391c-11dd-90d9-001a92567626'; // По умолчанию Киев
let cachedWarehouses = [];

function searchNpCities(query) {
    const suggestionsBox = document.getElementById('npCitySuggestions');
    if (query.length < 2) {
        suggestionsBox.style.display = 'none';
        return;
    }

    fetch('https://api.novaposhta.ua/v2.0/json/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: "",
            modelName: "Address",
            calledMethod: "searchSettlements",
            methodProperties: { CityName: query, Limit: "10" }
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data && data.data.length > 0 && data.data[0].Addresses) {
                let html = '';
                data.data[0].Addresses.forEach(city => {
                    let cityName = city.Present;
                    let cityRef = city.DeliveryCity;
                    html += `<div class="suggestion-item" onclick="selectCityFromApi('${cityName.replace(/'/g, "\\'")}', '${cityRef}')">${cityName}</div>`;
                });
                suggestionsBox.innerHTML = html;
                suggestionsBox.style.display = 'block';
            } else {
                suggestionsBox.style.display = 'none';
            }
        })
        .catch(err => console.log('Помилка API НП:', err));
}

function selectCityFromApi(cityName, cityRef) {
    document.getElementById('npCityInput').value = cityName;
    document.getElementById('npCitySuggestions').style.display = 'none';
    selectedCityRef = cityRef;
    loadNovaPoshtaWarehouses(cityRef);
}

function selectCityPreset(cityName, cityRef) {
    document.getElementById('npCityInput').value = cityName;
    document.getElementById('npCitySuggestions').style.display = 'none';
    selectedCityRef = cityRef;
    loadNovaPoshtaWarehouses(cityRef);
}

function switchNpSubtype() {
    renderFilteredWarehouses();
}

function loadNovaPoshtaWarehouses(cityRef) {
    const selectElem = document.getElementById('npTargetSelect');
    if (selectElem) selectElem.innerHTML = '<option value="">Завантаження відділень...</option>';

    fetch('https://api.novaposhta.ua/v2.0/json/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: "",
            modelName: "Address",
            calledMethod: "getWarehouses",
            methodProperties: {
                CityRef: cityRef,
                Language: "UA"
            }
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data && data.data.length > 0) {
                cachedWarehouses = data.data;
                renderFilteredWarehouses();
            } else {
                cachedWarehouses = [];
                if (selectElem) selectElem.innerHTML = '<option value="">Нічого не знайдено для цього міста</option>';
            }
        })
        .catch(err => {
            console.log('Помилка завантаження відділень НП:', err);
            if (selectElem) selectElem.innerHTML = '<option value="">Помилка завантаження</option>';
        });
}

function renderFilteredWarehouses() {
    const selectElem = document.getElementById('npTargetSelect');
    if (!selectElem) return;

    const currentSubtype = document.querySelector('input[name="np_sub"]:checked').value;
    let filtered = [];

    if (currentSubtype === 'branch') {
        filtered = cachedWarehouses.filter(wh => !wh.Description.toLowerCase().includes('поштомат') && !wh.Description.toLowerCase().includes('поштоматное'));
    } else if (currentSubtype === 'postomat') {
        filtered = cachedWarehouses.filter(wh => wh.Description.toLowerCase().includes('поштомат'));
    }

    if (filtered.length === 0) {
        filtered = cachedWarehouses;
    }

    let optionsHtml = '';
    filtered.forEach(wh => {
        optionsHtml += `<option value="${wh.Number}">${wh.Description}</option>`;
    });
    selectElem.innerHTML = optionsHtml || '<option value="">Нічого не знайдено</option>';
}