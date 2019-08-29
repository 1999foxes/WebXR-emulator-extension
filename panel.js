const port = chrome.runtime.connect(null, {name: 'panel'});
const tabId = chrome.devtools.inspectedWindow.tabId;

// receive message from contentScript via background

port.onMessage.addListener(message => {
  // notify the poses to sync
  // if main page is reloaded while panel is opened
  if (message.action === 'webxr-startup') {
    notifyPoses();
  }
});

// send message to contentScript via background

const postMessage = (message) => {
  message.tabId = tabId;
  port.postMessage(message);
};

const notifyPoseChange = (objectName, node) => {
  postMessage({
    action: 'webxr-pose',
    objectName: objectName,
    position: node.position.toArray([]), // @TODO: reuse array
    quaternion: node.quaternion.toArray([]) // @TODO: reuse array
  });
};

const notifyButtonPressed = (objectName, pressed) => {
  postMessage({
    action: 'webxr-button',
    objectName: objectName,
    pressed: pressed
  });
};

const notifyPoses = () => {
  for (const key in assetNodes) {
    if (assetNodes[key]) {
      notifyPoseChange(key, assetNodes[key]);
    }
  }
};

//

const states = {
  translateMode: false, // true: translate mode, false: rotate mode
  rightButtonPressed: false,
  leftButtonPressed: false
};

const deviceCapabilities = {
  headset: {
    hasPosition: false,
    hasRotation: false
  },
  controller: {
    hasPosition: false,
    hasRotation: false
  }
};

const transformControls = {
  headset: null,
  rightHand: null,
  leftHand: null
};

const assetNodes = {
  headset: null,
  rightHand: null,
  leftHand: null
};

// @TODO: Currently the values are　groundless.
//        Set more appropriate values.
const defaultTransforms = {
  headset: {
    position: new THREE.Vector3(0, 2, 0),
    rotation: new THREE.Euler(0, 0, 0)
  },
  rightHand: {
    position: new THREE.Vector3(0.5, 1.5, -1.0),
    rotation: new THREE.Euler(0, 0, 0)
  },
  leftHand: {
    position: new THREE.Vector3(-0.5, 1.5, -1.0),
    rotation: new THREE.Euler(0, 0, 0)
  }
};

// initialize Three.js objects

// renderer

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// scene, camera, light, grid

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-3, 3, 4);
camera.lookAt(new THREE.Vector3(0, 2, 0));

const render = () => {
  renderer.render(scene, camera);
};

const light = new THREE.DirectionalLight(0xffffff);
light.position.set(-1, 1, -1);
scene.add(light);

const gridHelper = new THREE.PolarGridHelper(10, 5);
scene.add(gridHelper);

// orbit controls for camera

const orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
orbitControls.addEventListener('change', render);
orbitControls.target.set(0, 2, 0);
orbitControls.update(); // seems like this line is necessary if I set non-zero as target

// transform controls for device assets

const createTransformControls = (target, onChange) => {
  const controls = new THREE.TransformControls(camera, renderer.domElement);
  controls.setMode(states.translateMode ? 'translate' : 'rotate');
  controls.setSpace('local');
  controls.attach(target);
  controls.setSize(1.5);

  controls.addEventListener('mouseDown', () => {
    orbitControls.enabled = false;
  }, false);

  controls.addEventListener('mouseUp', () => {
    orbitControls.enabled = true;
  }, false);

  controls.addEventListener('change', () => {
    onChange();
    render();
  }, false);

  return controls;
};

const setupTransformControlsEnability = (controls, enabled, capabilities) => {
  controls.visible = enabled;
  controls.enabled = enabled;

  // disable if device doesn't have capability of current transform mode
  if (controls.enabled) {
    if ((states.translateMode && !capabilities.hasPosition) ||
        (!states.translateMode && !capabilities.hasRotation)) {
      controls.enabled = false;
    }
  }
};

// device assets

const loadHeadsetAsset = () => {
  new THREE.OBJLoader().load('assets/headset.obj', headset => {
    const parent = new THREE.Object3D();
    parent.position.copy(defaultTransforms.headset.position);
    parent.rotation.copy(defaultTransforms.headset.rotation);
    headset.rotation.y = -Math.PI;

    scene.add(parent.add(headset));
    assetNodes.headset = parent;

    const onChange = () => {
      notifyPoseChange('headset', parent);
    };

    const controls = createTransformControls(parent, onChange);
    setupTransformControlsEnability(controls,
      document.getElementById('headsetCheckbox').checked,
      deviceCapabilities.headset);

    scene.add(controls);
    transformControls.headset = controls;
    onChange();
    render();
  });
};

const loadControllersAsset = (loadRight, loadLeft) => {
  new THREE.GLTFLoader().load('assets/oculus-go-controller.gltf', gltf => {
    const baseController = gltf.scene;
    baseController.scale.multiplyScalar(6);

    const recursivelyClone = (node) => {
      const cloneWithMaterial = (object) => {
        const clonedObject = object.clone();
        // @TODO: support material array?
        if (clonedObject.material) {
          clonedObject.material = clonedObject.material.clone();
        }
        return clonedObject;
      };
      const traverse = (object, parent) => {
        const clonedObject = cloneWithMaterial(object);
        if (parent) {
          parent.add(clonedObject);
        }
        for (const child of object.children) {
          traverse(child, clonedObject);
        }
        return clonedObject;
      };
      return traverse(node);
    };

    // key: 'rightHand' or 'leftHand'
    const setupController = (key) => {
      const parent = new THREE.Object3D();
      const controller = recursivelyClone(baseController);

      parent.position.copy(defaultTransforms[key].position);
      parent.rotation.copy(defaultTransforms[key].rotation);
      parent.add(controller);

      scene.add(parent);

      assetNodes[key] = parent;

      const onChange = () => {
        notifyPoseChange(key, parent);
      };

      const controls = createTransformControls(parent, onChange);
      setupTransformControlsEnability(controls,
        document.getElementById(key + 'Checkbox').checked,
        deviceCapabilities.controller);

      scene.add(controls);
      transformControls[key] = controls;
      onChange();
    };

    if (loadRight) {
      setupController('rightHand');
    }

    if (loadLeft) {
      setupController('leftHand');
    }

    render();
  });
};

const updateAssetNodes = (deviceKey, deviceJSON) => {
  // firstly remove all existing resources and disable all panel controls

  for (const key in assetNodes) {
    const node = assetNodes[key];
    const controls = transformControls[key];

    if (!node) {
      continue;
    }

    if (node.parent) {
      node.parent.remove(node);
    }

    controls.detach();

    assetNodes[key] = null;
    transformControls[key] = null;
  }

  states.rightButtonPressed = false;
  states.leftButtonPressed = false;
  deviceCapabilities.headset.hasPosition = false;
  deviceCapabilities.headset.hasRotation = false;
  deviceCapabilities.controller.hasPosition = false;
  deviceCapabilities.controller.hasRotation = false;
  document.getElementById('showGizmosSpan').style.display = 'none';
  document.getElementById('headsetCheckboxSpan').style.display = 'none';
  document.getElementById('rightHandCheckboxSpan').style.display = 'none';
  document.getElementById('leftHandCheckboxSpan').style.display = 'none';
  document.getElementById('translateButton').style.display = 'none';
  document.getElementById('rightPressButton').style.display = 'none';
  document.getElementById('leftPressButton').style.display = 'none';
  document.getElementById('resetPoseButton').style.display = 'none';

  // secondly load new assets and enable necessary panel controls

  const deviceDefinition = deviceJSON.devices[deviceKey];

  const hasHeadset = !! deviceDefinition.headset;
  const hasRightController = deviceDefinition.controllers && deviceDefinition.controllers.length > 0;
  const hasLeftController = deviceDefinition.controllers && deviceDefinition.controllers.length > 1;

  deviceCapabilities.headset.hasPosition = hasHeadset && deviceDefinition.headset.hasPosition;
  deviceCapabilities.headset.hasRotation = hasHeadset && deviceDefinition.headset.hasRotation;
  deviceCapabilities.controller.hasPosition = hasRightController && deviceDefinition.controllers[0].hasPosition;
  deviceCapabilities.controller.hasRotation = hasRightController && deviceDefinition.controllers[0].hasRotation;

  const hasPosition = deviceCapabilities.headset.hasPosition || deviceCapabilities.controller.hasPosition;

  if (hasHeadset) {
    loadHeadsetAsset();
    document.getElementById('headsetCheckboxSpan').style.display = '';
  }

  if (hasRightController || hasLeftController) {
    loadControllersAsset(hasRightController, hasLeftController);
  }

  if (hasRightController) {
    document.getElementById('rightHandCheckboxSpan').style.display = '';
    document.getElementById('rightPressButton').style.display = '';
  }

  if (hasLeftController) {
    document.getElementById('leftHandCheckboxSpan').style.display = '';
    document.getElementById('leftPressButton').style.display = '';
  }

  if (hasHeadset || hasRightController || hasLeftController) {
    document.getElementById('showGizmosSpan').style.display = '';
    document.getElementById('resetPoseButton').style.display = '';
  }

  // expect if device has position capability it also has rotation capability
  if (hasPosition) {
    document.getElementById('translateButton').style.display = '';
  }

  // force to rotate mode if device doesn't have position capability
  if (!hasPosition && states.translateMode) {
    toggleTranslateMode();
  }

  render();
};

const updateControllerColor = (node, pressed) => {
  node.traverse(object => {
    if (!object.material) {
      return;
    }
    // @TODO: Support material array?
    const material = object.material;
    // I tried .color first but the looking of the current controller
    // models didn't differ well with changing .color so using emissive instead for now.
    if (!material.emissive) {
      return;
    }
    if (material.userData.originalEmissive === undefined) {
      material.userData.originalEmissive = material.emissive.clone();
    }
    if (pressed) {
      // redden if button is being pressed
      // @TODO: what if the origial emissive is red-ish?
      material.emissive.setRGB(0.5, 0, 0);
    } else {
      material.emissive.copy(material.userData.originalEmissive);
    }
  });
  render();
};

render();

// event handlers

window.addEventListener('resize', event => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
}, false);

const onHeadsetCheckboxChange = () => {
  if (!transformControls.headset) {
    return;
  }

  setupTransformControlsEnability(transformControls.headset,
    document.getElementById('headsetCheckbox').checked,
    deviceCapabilities.headset);
  render();
};

document.getElementById('headsetCheckbox')
  .addEventListener('change', onHeadsetCheckboxChange, false);

document.getElementById('headsetLabel').addEventListener('click', event => {
  const checkbox = document.getElementById('headsetCheckbox');
  checkbox.checked = !checkbox.checked;
  onHeadsetCheckboxChange();
});

// key: 'rightHand' or 'leftHand'
const onControllerCheckboxChange = (key) => {
  if (!transformControls[key]) {
    return;
  }

  setupTransformControlsEnability(transformControls[key],
    document.getElementById(key + 'Checkbox').checked,
    deviceCapabilities.controller);
  render();
};

const onRightHandCheckboxChange = () => {
  onControllerCheckboxChange('rightHand');
};

document.getElementById('rightHandCheckbox')
  .addEventListener('change', onRightHandCheckboxChange, false);

document.getElementById('rightHandLabel').addEventListener('click', event => {
  const checkbox = document.getElementById('rightHandCheckbox');
  checkbox.checked = !checkbox.checked;
  onRightHandCheckboxChange();
}, false);

const onLeftHandCheckboxChange = () => {
  onControllerCheckboxChange('leftHand');
};

document.getElementById('leftHandCheckbox')
  .addEventListener('change', onLeftHandCheckboxChange, false);

document.getElementById('leftHandLabel').addEventListener('click', event => {
  const checkbox = document.getElementById('leftHandCheckbox');
  checkbox.checked = !checkbox.checked;
  onLeftHandCheckboxChange();
}, false);

const toggleTranslateMode = () => {
  states.translateMode = !states.translateMode;

  for (const key in transformControls) {
    const controls = transformControls[key];

    if (!controls) {
      continue;
    }

    controls.setMode(states.translateMode ? 'translate' : 'rotate');
    setupTransformControlsEnability(controls,
      document.getElementById(key + 'Checkbox').checked,
      deviceCapabilities[key === 'headset' ? key : 'controller']);
  }

  render();
};

document.getElementById('translateButton').addEventListener('click', event => {
  toggleTranslateMode();
}, false);

document.getElementById('rightPressButton').addEventListener('click', event => {
  states.rightButtonPressed = !states.rightButtonPressed;
  notifyButtonPressed('rightHand', states.rightButtonPressed);
  updateControllerColor(assetNodes.rightHand, states.rightButtonPressed);
}, false);

document.getElementById('leftPressButton').addEventListener('click', event => {
  states.leftButtonPressed = !states.leftButtonPressed;
  notifyButtonPressed('leftHand', states.leftButtonPressed);
  updateControllerColor(assetNodes.leftHand, states.leftButtonPressed);
}, false);

document.getElementById('resetPoseButton').addEventListener('click', event => {
  for (const key in assetNodes) {
    const device = assetNodes[key];

    if (!device) {
      continue;
    }

    device.position.copy(defaultTransforms[key].position);
    device.rotation.copy(defaultTransforms[key].rotation);
  }
  notifyPoses();
  render();
}, false);

// setup configuration select elements from external devices.json file

fetch('./devices.json')
  .then(response => response.json())
  .then(json => {
    const deviceSelect = document.getElementById('deviceSelect');
    const devices = json.devices;
    const defaultKey = json.default.deviceKey;

    const deviceKeys = Object.keys(devices).sort();
    for (const key of deviceKeys) {
      const deviceDefinition = devices[key];
      const option = document.createElement('option');
      option.text = deviceDefinition.name;
      option.value = key;
      if (key === defaultKey) {
        option.selected = true;
      }
      deviceSelect.add(option);
    }

    const stereoSelect = document.getElementById('stereoSelect');
    const defaultStereoEffect = json.default.stereoEffect;

    const optionEnabled = document.createElement('option');
    optionEnabled.text = 'Enabled';
    optionEnabled.value = 'true';
    if (defaultStereoEffect) {
      optionEnabled.selected = true;
    }
    stereoSelect.add(optionEnabled);

    const optionDisabled = document.createElement('option');
    optionDisabled.text = 'Disabled';
    optionDisabled.value = 'false';
    if (!defaultStereoEffect) {
      optionDisabled.selected = true;
    }
    stereoSelect.add(optionDisabled);

    return json;
  })
  .then((deviceJson) => {
    loadConfiguration(deviceJson);
  }).catch(error => {
    console.error(error);
  });

// Displays message requestig reload the application page
// when device or stereo effect is changed by user

const displayReloadRequestMessage = () => {
  const messageSpan = document.getElementById('message');
  while (messageSpan.childElementCount !== 0) {
    messageSpan.removeChild(messageSpan.children[0]);
  }
  const textSpan = document.createElement('span');
  textSpan.style.color = '#a00';
  textSpan.style.background = '#ffd';
  textSpan.textContent = 'Reload to reflect the change';
  messageSpan.appendChild(textSpan);
  // disapears in five seconds.
  setTimeout(() => {
    if (textSpan.parentElement !== null) {
      messageSpan.removeChild(textSpan);
    }
  }, 5000);
};

// load/store configurations

const loadConfiguration = (deviceJson) => {
  const deviceSelect = document.getElementById('deviceSelect');
  const stereoSelect = document.getElementById('stereoSelect');
  const configurationId = 'webxr-extension';

  const storeValues = () => {
    const storedValue = {};
    const deviceKey = deviceSelect.children[deviceSelect.selectedIndex].value;
    const stereoEffect = stereoSelect.children[stereoSelect.selectedIndex].value;
    // @TODO: Remove duplicated code. Serialization code is in XRDeviceManager too.
    storedValue[configurationId] = JSON.stringify({
      deviceKey: deviceKey,
      stereoEffect: stereoEffect === 'true'
    });
    chrome.storage.local.set(storedValue, () => {
      // window.alert(window); // to check if works
    });
    displayReloadRequestMessage();
    updateAssetNodes(deviceKey, deviceJson);
  };

  // load configuration and then load assets

  chrome.storage.local.get(configurationId, result => {
    const json = JSON.parse(result[configurationId] || '{}');
    const deviceKey = json.deviceKey;
    const stereoEffect = json.stereoEffect;

    for (let index = 0; index < deviceSelect.children.length; index++) {
      const option = deviceSelect.children[index];
      if (option.value === deviceKey) {
        deviceSelect.selectedIndex = index;
        break;
      }
    }

    if (stereoEffect !== undefined) {
      stereoSelect.selectedIndex = stereoEffect ? 0 : 1;
    }

    updateAssetNodes(deviceSelect.children[deviceSelect.selectedIndex].value, deviceJson);
  });

  deviceSelect.addEventListener('change', storeValues);
  stereoSelect.addEventListener('change', storeValues);
};