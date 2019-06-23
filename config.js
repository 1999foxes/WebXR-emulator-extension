const configurationId = 'webxr-extension';
const initialValues = '1:0'.split(':'); // @TODO: Import from Configuration

const deviceSelect = document.getElementById('deviceSelect');
const stereoSelect = document.getElementById('stereoSelect');

chrome.storage.local.get(configurationId, result => {
  const values = (result[configurationId] || '').split(':');
  let deviceIndex = parseInt(values[0]);
  let stereoIndex = parseInt(values[1]);

  if (isNaN(deviceIndex)) {
    deviceIndex = initialValues[0];
  }

  if (isNaN(stereoIndex)) {
    stereoIndex = initialValues[1];
  }

  deviceSelect.selectedIndex = deviceIndex;
  stereoSelect.selectedIndex = stereoIndex;
});

deviceSelect.addEventListener('change', storeValues);
stereoSelect.addEventListener('change', storeValues);

function storeValues() {
  const storedValue = {};
  storedValue[configurationId] = [
    deviceSelect.selectedIndex,
    stereoSelect.selectedIndex
  ].join(':');
  chrome.storage.local.set(storedValue, () => {
    // window.alert(window); // to check if works
  });
}