
(() => {
  const $ = id => document.getElementById(id);

  const ids = [
    "customer-name", "customer-phone",
    "address-house", "address-street", "address-area",
    "address-city", "address-postcode", "landmark-notes",
    "customer-address", "delivery-latitude",
    "delivery-longitude", "delivery-address-source"
  ];

  const el = Object.fromEntries(ids.map(id => [id, $(id)]));

  const locationTab = $("pick-location-tab");
  const manualTab = $("manual-address-tab");
  const locationPanel = $("location-picker-panel");
  const manualPanel = $("manual-address-panel");
  const addressFields = $("delivery-address-fields");
  const heading = $("address-form-heading");
  const search = $("location-search");
  const suggestions = $("location-suggestions");
  const status = $("location-status");
  const gpsButton = $("use-current-location");

  let map;
  let marker;
  let searchTimer;
  let searchController;
  let reverseController;
  let mode = "location";
  let locationChosen = false;

  function setStatus(message) {
    status.textContent = message;
  }

    function updateAddress() {
    const combined = [
      el["address-house"].value,
      el["address-street"].value,
      el["address-area"].value,
      el["address-city"].value,
      el["address-postcode"].value
    ].map(v => v.trim()).filter(Boolean).join(", ");

    el["customer-address"].value = combined;
  }

  function showAddressForm(show) {
    addressFields.hidden = !show;
  }

  function switchMode(nextMode) {
    mode = nextMode;
    const picking = mode === "location";

    locationTab.classList.toggle("active", picking);
    manualTab.classList.toggle("active", !picking);

    locationTab.setAttribute("aria-pressed", String(picking));
    manualTab.setAttribute("aria-pressed", String(!picking));

    locationPanel.hidden = !picking;
    manualPanel.hidden = picking;

    el["delivery-address-source"].value =
      picking ? "location" : "manual";

    if (picking) {
      showAddressForm(true);
      heading.textContent = "Confirm your delivery address";
      initMap();
      setTimeout(() => map && map.invalidateSize(), 100);
    } else {
      el["delivery-latitude"].value = "";
      el["delivery-longitude"].value = "";
      showAddressForm(true);
      heading.textContent = "Enter your delivery address";
    }
  }

  locationTab.addEventListener("click", () => switchMode("location"));
  manualTab.addEventListener("click", () => switchMode("manual"));

  function initMap() {
    if (map || !window.L) return;

    // General map view only, not the customer's actual location.
    const BASE_LOCATION = [12.8115, 77.6970];
    map = L.map("delivery-map").setView(BASE_LOCATION, 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    map.on("click", event => {
      selectCoordinates(
        event.latlng.lat,
        event.latlng.lng,
        "map"
      );
    });
  }

  function moveMarker(lat, lon) {
    initMap();
    if (!map) return;

    const point = [lat, lon];

    if (!marker) {
      marker = L.marker(point, { draggable: true }).addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        selectCoordinates(p.lat, p.lng, "map");
      });
    } else {
      marker.setLatLng(point);
    }

    map.setView(point, 17);
  }

  async function requestJSON(url, controller) {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("Address lookup failed.");
    }

    return response.json();
  }

  function fillAddress(address = {}) {
    const streetName = address.road ||
      address.pedestrian ||
      address.residential ||
      address.footway || "";

    const street = [
      address.house_number || "",
      streetName
    ].filter(Boolean).join(" ");

    const area = address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.city_district || "";

    const city = address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county || "";

    // Fill available information, without erasing user-entered data
    // when the geocoder has no value for a field.
    if (street) el["address-street"].value = street;
    if (area) el["address-area"].value = area;
    if (city) el["address-city"].value = city;

    if (address.postcode) {
      el["address-postcode"].value = address.postcode;
    }

    if (address.building && !el["address-house"].value) {
      el["address-house"].value = address.building;
    }

    updateAddress();
  }

  async function reverseGeocode(lat, lon) {
    if (reverseController) reverseController.abort();
    reverseController = new AbortController();

    const url = new URL(
      "https://nominatim.openstreetmap.org/reverse"
    );

    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lon),
      addressdetails: "1",
      zoom: "18"
    });

    return requestJSON(url, reverseController);
  }

  async function selectCoordinates(lat, lon, source) {
    el["delivery-latitude"].value = lat.toFixed(7);
    el["delivery-longitude"].value = lon.toFixed(7);
    el["delivery-address-source"].value = source;

    locationChosen = true;
    showAddressForm(true);
    heading.textContent = "Confirm your delivery address";
    moveMarker(lat, lon);
    setStatus("Finding the address…");

    try {
      const result = await reverseGeocode(lat, lon);

      fillAddress(result.address || {});

      if (result.display_name) {
        search.value = result.display_name;
        setStatus(
          "Location selected. Check your address and add your flat number."
        );
      } else {
        setStatus(
          "Location selected. Please complete the address details."
        );
      }
    } catch (error) {
      if (error.name === "AbortError") return;

      setStatus(
        "The location is selected, but address lookup failed. " +
        "Please complete the address manually."
      );
    }
  }

  async function searchAddress(query) {
    if (searchController) searchController.abort();
    searchController = new AbortController();

    const url = new URL(
      "https://nominatim.openstreetmap.org/search"
    );

    url.search = new URLSearchParams({
      format: "jsonv2",
      q: query,
      addressdetails: "1",
      limit: "5"
    });

    return requestJSON(url, searchController);
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    if (searchController) searchController.abort();

    suggestions.replaceChildren();
    const query = search.value.trim();

    if (query.length < 3) return;

    searchTimer = setTimeout(async () => {
      setStatus("Searching addresses…");

      try {
        const results = await searchAddress(query);
        suggestions.replaceChildren();

        results.forEach(place => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "location-suggestion";
          button.textContent = place.display_name;

          button.addEventListener("click", () => {
            suggestions.replaceChildren();

            selectCoordinates(
              Number(place.lat),
              Number(place.lon),
              "search"
            );
          });

          suggestions.appendChild(button);
        });

        setStatus(results.length
          ? "Choose the correct address from the suggestions."
          : "No addresses found. Try another search.");
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus("Search is unavailable. Please try again.");
        }
      }
    }, 1100);
  });

  gpsButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("GPS is unavailable. Search for your address instead.");
      return;
    }

    gpsButton.disabled = true;
    setStatus("Requesting location permission…");

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          await selectCoordinates(
            position.coords.latitude,
            position.coords.longitude,
            "gps"
          );
        } finally {
          gpsButton.disabled = false;
        }
      },
      error => {
        gpsButton.disabled = false;

        setStatus(error.code === 1
          ? "Location permission denied. Search or enter your address manually."
          : "Could not determine your location. Please try searching.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });

  // Keep the combined address current as the customer edits fields.
  [
    "address-house", "address-street", "address-area",
    "address-city", "address-postcode"
  ].forEach(id => $(id).addEventListener("input", updateAddress));

  // Expose helpers for the existing checkout integration.
  window.syncDeliveryAddress = updateAddress;
  window.switchAddressMode = switchMode;

  // Start with the picker only; no address form is displayed.
  showAddressForm(true);
  switchMode("manual");
})();
