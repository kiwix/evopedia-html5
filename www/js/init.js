/**
 * init.js : Configuration for the library require.js
 * This file handles the dependencies between javascript libraries
 *
 * Copyright 2013-2020 Mossroy and contributors
 * License GPL v3:
 *
 * This file is part of Kiwix.
 *
 * Kiwix is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Kiwix is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Kiwix (file LICENSE-GPLv3.txt).  If not, see <http://www.gnu.org/licenses/>
 */
'use strict';

/* global requirejs */

/**
 * A global parameter object for storing variables that need to be remembered between page loads,
 * or across different functions and modules
 *
 * @type Object
 */
var params = {};

// The key prefix used by the settingsStore.js (see comment there for explanation), but we also need it below
params['keyPrefix'] = 'kiwixjs-'

// The following lines check the querystring for a communication from the PWA indicating it has successfully launched.
// If this querystring is received, then the app will set a success key in the extension's localStorage and then halt further processing.
// This is used to prevent a "boot loop" where the app will keep jumping to a failed install of the PWA.
if (/PWA_launch=/.test(window.location.search)) {
    var match = /PWA_launch=([^&]+)/.exec(window.location.search);
    localStorage.setItem(params.keyPrefix + 'PWA_launch', match[1]);
    // If we have successfully launched the PWA (even if there was no SW mode available), we prevent future default mode change alerts
    if (match[1] === 'success') localStorage.setItem(params.keyPrefix + 'defaultModeChangeAlertDisplayed', true);
    console.warn('Launch of PWA has been registered as "' + match[1] + '" by the extension. Exiting local code.');
} else {
    require.config({
        baseUrl: 'js/lib',
        paths: {
            jquery: 'jquery-3.7.0.slim.min',
            bootstrap: 'bootstrap.bundle',
            webpHeroBundle: 'webpHeroBundle_0.0.2',
            fontawesome: 'fontawesome/fontawesome',
            'fontawesome-solid': 'fontawesome/solid'
        },
        shim: {
            jquery: {
                exports: '$'
            },
            bootstrap: {
                deps: ['jquery', 'fontawesome', 'fontawesome-solid']
            },
            webpHeroBundle: ''
        }
    });

    var req = ['bootstrap']; // Baseline Require array

    // Add polyfills to the Require array only if needed
    if (!('Promise' in self)) req.push('promisePolyfill');
    if (!('from' in Array)) req.push('arrayFromPolyfill');

    requirejs(req, function () {
        requirejs(['../app']);
    });

    // Test if WebP is natively supported, and if not, set webpMachine to true. The value of webpMachine
    // will determine whether the WebP Polyfills will be loaded (currently only used in uiUtil.js)
    var webpMachine = false;

    // We use a self-invoking function here to avoid defining unnecessary global functions and variables
    (function (callback) {
        // Tests for native WebP support
        var webP = new Image();
        webP.onload = webP.onerror = function () {
            callback(webP.height === 2);
        };
        webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    })(function (support) {
        if (!support) {
            webpMachine = true;
        }
    });
}
