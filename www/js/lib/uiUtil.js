/**
 * uiUtil.js : Utility functions for the User Interface
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

// DEV: Put your RequireJS definition in the rqDef array below, and any function exports in the function parenthesis of the define statement
// We need to do it this way in order to load WebP polyfills conditionally. The WebP polyfills are only needed by a few old browsers, so loading them
// only if needed saves approximately 1MB of memory.
var rqDef = ['settingsStore'];

// Add WebP polyfill only if webpHero was loaded in init.js
if (webpMachine) {
    rqDef.push('webpHeroBundle');
}

define(rqDef, function(settingsStore) {
  
    /**
     * Creates either a blob: or data: URI from the given content
     * The given attribute of the DOM node (nodeAttribute) is then set to this URI
     * 
     * This is used to inject images (and other dependencies) into the article DOM
     * 
     * @param {Object} node The node to which the URI should be added
     * @param {String} nodeAttribute The attribute to set to the URI
     * @param {Uint8Array} content The binary content to convert to a URI
     * @param {String} mimeType The MIME type of the content
     * @param {Function} callback An optional function to call with the URI
     */
    function feedNodeWithBlob(node, nodeAttribute, content, mimeType, callback) {
        // Decode WebP data if the browser does not support WebP and the mimeType is webp
        if (webpMachine && /image\/webp/i.test(mimeType)) {
            // DEV: Note that webpMachine is single threaded and will reject an image if it is busy
            // However, the loadImagesJQuery() function in app.js is sequential (it waits for a callback
            // before processing another image) so we do not need to queue WebP images here
            webpMachine.decode(content).then(function (uri) {
                // DEV: WebpMachine.decode() returns a data: URI
                // We callback before the node is set so that we don't incur slow DOM rewrites before processing more images
                if (callback) callback(uri);
                node.setAttribute(nodeAttribute, uri);
            }).catch(function (err) {
                console.error('There was an error decoding image in WebpMachine', err);
                if (callback) callback();
            });
        } else {
            var blob = new Blob([content], {
                type: mimeType
            });
            var url = URL.createObjectURL(blob);
            if (callback) callback(url);
            node.addEventListener('load', function () {
                URL.revokeObjectURL(url);
            });
            node.setAttribute(nodeAttribute, url);
        }
    }

    /**
     * Replace the given CSS link (from the DOM) with an inline CSS of the given content
     * 
     * Due to CSP, Firefox OS does not accept <link> syntax with href="data:text/css..." or href="blob:..."
     * So we replace the tag with a <style type="text/css">...</style>
     * while copying some attributes of the original tag
     * Cf http://jonraasch.com/blog/javascript-style-node
     * 
     * @param {Element} link The original link node from the DOM
     * @param {String} cssContent The content to insert as an inline stylesheet
     */
    function replaceCSSLinkWithInlineCSS (link, cssContent) {
        var cssElement = document.createElement('style');
        cssElement.type = 'text/css';
        if (cssElement.styleSheet) {
            cssElement.styleSheet.cssText = cssContent;
        } else {
            cssElement.appendChild(document.createTextNode(cssContent));
        }
        var mediaAttributeValue = link.getAttribute('media');
        if (mediaAttributeValue) {
            cssElement.media = mediaAttributeValue;
        }
        var disabledAttributeValue = link.getAttribute('disabled');
        if (disabledAttributeValue) {
            cssElement.disabled = disabledAttributeValue;
        }
        link.parentNode.replaceChild(cssElement, link);
    }
        
    /**
     * Removes parameters and anchors from a URL
     * @param {type} url The URL to be processed
     * @returns {String} The same URL without its parameters and anchors
     */
    function removeUrlParameters(url) {
        // Remove any querystring
        var strippedUrl = url.replace(/\?[^?]*$/, '');
        // Remove any anchor parameters - note that we are deliberately excluding entity references, e.g. '&#39;'.
        strippedUrl = strippedUrl.replace(/#[^#;]*$/, '');
        return strippedUrl;
    }

    /**
     * Derives the URL.pathname from a relative or semi-relative URL using the given base ZIM URL
     * 
     * @param {String} url The (URI-encoded) URL to convert (e.g. "Einstein", "../Einstein",
     *      "../../I/im%C3%A1gen.png", "-/s/style.css", "/A/Einstein.html", "../static/bootstrap/css/bootstrap.min.css")
     * @param {String} base The base ZIM URL of the currently loaded article (e.g. "A/", "A/subdir1/subdir2/", "C/Singapore/")
     * @returns {String} The derived ZIM URL in decoded form (e.g. "A/Einstein", "I/imágen.png", "C/")
     */
    function deriveZimUrlFromRelativeUrl(url, base) {
        // We use a dummy domain because URL API requires a valid URI
        var dummy = 'http://d/';
        var deriveZimUrl = function (url, base) {
            if (typeof URL === 'function') return new URL(url, base);
            // IE11 lacks URL API: workaround adapted from https://stackoverflow.com/a/28183162/9727685
            var d = document.implementation.createHTMLDocument('t');
            d.head.innerHTML = '<base href="' + base + '">';
            var a = d.createElement('a');
            a.href = url;
            return { pathname: a.href.replace(dummy, '') };
        };
        var zimUrl = deriveZimUrl(url, dummy + base);
        return decodeURIComponent(zimUrl.pathname.replace(/^\//, ''));
    }

    /**
     * Displays a Bootstrap warning alert with information about how to access content in a ZIM with unsupported active UI
     */
    var activeContentWarningSetup = false;
    function displayActiveContentWarning() {
        var alertActiveContent = document.getElementById('activeContent');
        alertActiveContent.style.display = 'block';
        if (!activeContentWarningSetup) {
            // We are setting up the active content warning for the first time
            activeContentWarningSetup = true;
            alertActiveContent.querySelector('button[data-hide]').addEventListener('click', function() {
                alertActiveContent.style.display = 'none';
            });
            ['swModeLink', 'stop'].forEach(function(id) {
                // Define event listeners for both hyperlinks in alert box: these take the user to the Config tab and highlight
                // the options that the user needs to select
                document.getElementById(id).addEventListener('click', function () {
                    var elementID = id === 'stop' ? 'hideActiveContentWarningCheck' : 'serviceworkerModeRadio';
                    var thisLabel = document.getElementById(elementID).parentNode;
                    thisLabel.style.borderColor = 'red';
                    thisLabel.style.borderStyle = 'solid';
                    var btnHome = document.getElementById('btnHome');
                    [thisLabel, btnHome].forEach(function (ele) {
                        // Define event listeners to cancel the highlighting both on the highlighted element and on the Home tab
                        ele.addEventListener('mousedown', function () {
                            thisLabel.style.borderColor = '';
                            thisLabel.style.borderStyle = '';
                        });
                    });
                    document.getElementById('btnConfigure').click();
                });
            });
        }
    }

    /**
     * Displays a Bootstrap alert box at the foot of the page to enable saving the content of the given title to the device's filesystem
     * and initiates download/save process if this is supported by the OS or Browser
     * 
     * @param {String} title The path and filename to the file to be extracted
     * @param {Boolean|String} download A Bolean value that will trigger download of title, or the filename that should
     *     be used to save the file in local FS
     * @param {String} contentType The mimetype of the downloadable file, if known
     * @param {Uint8Array} content The binary-format content of the downloadable file
     */
    var downloadAlertSetup = false;
    function displayFileDownloadAlert(title, download, contentType, content) {
        var downloadAlert = document.getElementById('downloadAlert');
        downloadAlert.style.display = 'block';
        if (!downloadAlertSetup) downloadAlert.querySelector('button[data-hide]').addEventListener('click', function() {
            // We are setting up the alert for the first time
            downloadAlert.style.display = 'none';
        });
        downloadAlertSetup = true;
        // Download code adapted from https://stackoverflow.com/a/19230668/9727685 
        // Set default contentType if none was provided
        if (!contentType) contentType = 'application/octet-stream';
        var a = document.createElement('a');
        var blob = new Blob([content], { 'type': contentType });
        // If the filename to use for saving has not been specified, construct it from title
        var filename = download === true ? title.replace(/^.*\/([^\/]+)$/, '$1') : download;
        // Make filename safe
        filename = filename.replace(/[\/\\:*?"<>|]/g, '_');
        a.href = window.URL.createObjectURL(blob);
        a.target = '_blank';
        a.type = contentType;
        a.download = filename;
        a.classList.add('alert-link');
        a.innerHTML = filename;
        var alertMessage = document.getElementById('alertMessage');
        alertMessage.innerHTML = '<strong>Download</strong> If the download does not start, please tap the following link: ';
        // We have to add the anchor to a UI element for Firefox to be able to click it programmatically: see https://stackoverflow.com/a/27280611/9727685
        alertMessage.appendChild(a);
        try { a.click(); }
        catch (err) {
            // If the click fails, user may be able to download by manually clicking the link
            // But for IE11 we need to force use of the saveBlob method with the onclick event 
            if (window.navigator && window.navigator.msSaveBlob) {
                a.addEventListener('click', function(e) {
                    window.navigator.msSaveBlob(blob, filename);
                    e.preventDefault();
                });
            }
        }
        $("#searchingArticles").hide();
    }

    /**
     * Check for update of Service Worker (PWA) and display information to user
     */
    var updateAlert = document.getElementById('updateAlert');
    function checkUpdateStatus(appstate) {
        if ('serviceWorker' in navigator && !appstate.pwaUpdateNeeded) {
            settingsStore.getCacheNames(function (cacheNames) {
                if (cacheNames && !cacheNames.error) {
                    // Store the cacheNames globally for use elsewhere
                    params.cacheNames = cacheNames;
                    caches.keys().then(function (keyList) {
                        updateAlert.style.display = 'none';
                        var cachePrefix = cacheNames.app.replace(/^([^\d]+).+/, '$1');
                        keyList.forEach(function (key) {
                            if (key === cacheNames.app || key === cacheNames.assets) return;
                            // Ignore any keys that do not begin with the appCache prefix (they could be from other apps using the same domain)
                            if (key.indexOf(cachePrefix)) return;
                            // If we get here, then there is a cache key that does not match our version, i.e. a PWA-in-waiting
                            appstate.pwaUpdateNeeded = true;
                            updateAlert.style.display = 'block';
                            document.getElementById('persistentMessage').innerHTML = 'Version ' + key.replace(cachePrefix, '') +
                                ' is ready to install. (Re-launch app to install.)';
                        });
                    });
                }
            });
        }
    }
    if (updateAlert) updateAlert.querySelector('button[data-hide]').addEventListener('click', function () {
        updateAlert.style.display = 'none';
    });

    /**
     * Checks if a server is accessible by attempting to load a test image from the server
     * @param {String} imageSrc The full URI of the image
     * @param {any} onSuccess A function to call if the image can be loaded
     * @param {any} onError A function to call if the image cannot be loaded
     */
     function checkServerIsAccessible(imageSrc, onSuccess, onError) {
        var image = new Image();
        image.onload = onSuccess;
        image.onerror = onError;
        image.src = imageSrc;
    }

    /**
     * Show or hide the spinner together with a message
     * @param {Boolean} show True to show the spinner, false to hide it 
     * @param {String} message A message to display, or hide the message if null 
     */
    function spinnerDisplay(show, message) {
        var searchingArticles = document.getElementById('searchingArticles');
        var spinnerMessage = document.getElementById('cachingAssets');
        if (show) searchingArticles.style.display = 'block';
        else searchingArticles.style.display = 'none';
        if (message) {
            spinnerMessage.innerHTML = message;
            spinnerMessage.style.display = 'block';
        } else {
            spinnerMessage.innerHTML = 'Caching assets...';
            spinnerMessage.style.display = 'none';
        }
    }

    /**
     * Checks whether an element is partially or fully inside the current viewport
     * 
     * @param {Element} el The DOM element for which to check visibility
     * @param {Boolean} fully If true, checks that the entire element is inside the viewport; 
     *          if false, checks whether any part of the element is inside the viewport
     * @returns {Boolean} True if the element is fully or partially (depending on the value of <fully>)
     *          inside the current viewport
     */
    function isElementInView(el, fully) {
        var rect = el.getBoundingClientRect();
        if (fully)
            return rect.top > 0 && rect.bottom < window.innerHeight && rect.left > 0 && rect.right < window.innerWidth;
        else 
            return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
    }

    /**
     * Removes the animation effect between various sections
     */
    function removeAnimationClasses() {
        $('#about').removeClass('slideIn_L').removeClass('slideOut_R');
        $('#configuration').removeClass('slideIn_L').removeClass('slideIn_R').removeClass('slideOut_L').removeClass('slideOut_R');
        $('#articleContent').removeClass('slideIn_R').removeClass('slideOut_L');
    }
    
    /**
     * Adds the slide animation between different sections
     * 
     * @param {String} section It takes the name of the section to which the animation is to be added
     * 
     */
    function applyAnimationToSection(section) {
        if (section == 'home') {
            if (!$('#configuration').is(':hidden')) {
                $('#configuration').addClass('slideOut_R');
                setTimeout(function () {
                    $('#configuration').hide();
                }, 300);
            }
            if (!$('#about').is(':hidden')) {
                $('#about').addClass('slideOut_R');
                setTimeout(function () {
                    $('#about').hide();
                }, 300);
            }
            $('#articleContent').addClass('slideIn_R');
            setTimeout(function () {
                $('#articleContent').show();
            }, 300);
        } else if (section == 'config') {
            if (!$('#about').is(':hidden')) {
                $('#about').addClass('slideOut_R');
                $('#configuration').addClass('slideIn_R');
                setTimeout(function () {
                    $('#about').hide();
                }, 300);
            } else if (!$('#articleContent').is(':hidden')) {
                $('#articleContent').addClass('slideOut_L');
                $('#configuration').addClass('slideIn_L');
                setTimeout(function () {
                    $('#articleContent').hide();
                }, 300);
            }
            setTimeout(function () {
                $('#configuration').show();
            }, 300);
        } else if (section == 'about') {
            if (!$('#configuration').is(':hidden')) {
                $('#configuration').addClass('slideOut_L');
                setTimeout(function () {
                    $('#configuration').hide();
                }, 300);
            }
            if (!$('#articleContent').is(':hidden')) {
                $('#articleContent').addClass('slideOut_L');
                setTimeout(function () {
                    $('#articleContent').hide();
                }, 300);
            }
            $('#about').addClass('slideIn_L');
            setTimeout(function () {
                $('#about').show();
            }, 300);
        }
    }

    /**
     * Applies the requested app and content theme
     * 
     * A <theme> string consists of two parts, the appTheme (theme to apply to the app shell only), and an optional
     * contentTheme beginning with an underscore: e.g. 'dark_invert' = 'dark' (appTheme) + '_invert' (contentTheme)
     * Current themes are: light, dark, dark_invert, dark_mwInvert but code below is written for extensibility
     * For each appTheme (except the default 'light'), a corresponding set of rules must be present in app.css
     * For each contentTheme, a stylesheet must be provided in www/css that is named 'kiwixJS' + contentTheme
     * A rule may additionally be needed in app.css for full implementation of contentTheme
     * 
     * @param {String} theme The theme to apply (light|dark[_invert|_mwInvert])
     */
    function applyAppTheme(theme) {
        var htmlEl = document.querySelector('html');
        var footer = document.querySelector('footer');
        var oldTheme = htmlEl.dataset.theme || '';
        var iframe = document.getElementById('articleContent');
        var doc = iframe.contentDocument;
        var kiwixJSSheet = doc ? doc.getElementById('kiwixJSTheme') || null : null;
        var appTheme = theme.replace(/_.*$/, '');
        var contentTheme = theme.replace(/^[^_]*/, '');
        var oldAppTheme = oldTheme.replace(/_.*$/, '');
        var oldContentTheme = oldTheme.replace(/^[^_]*/, '');
        // Remove oldAppTheme and oldContentTheme
        if (oldAppTheme) htmlEl.classList.remove(oldAppTheme);
        // A missing contentTheme implies _light
        footer.classList.remove(oldContentTheme || '_light');
        // Apply new appTheme (NB it will not be added twice if it's already there)
        if (appTheme) htmlEl.classList.add(appTheme);
        // We also add the contentTheme to the footer to avoid dark css rule being applied to footer when content
        // is not dark (but we want it applied when the content is dark or inverted)
        footer.classList.add(contentTheme || '_light');
        // Embed a reference to applied theme, so we can remove it generically in the future
        htmlEl.dataset.theme = theme;
        // Hide any previously displayed help
        var oldHelp = document.getElementById(oldTheme + '-help');
        if (oldHelp) oldHelp.style.display = 'none';
        // Show any specific help for selected contentTheme
        var help = document.getElementById(theme + '-help');
        if (help) help.style.display = 'block';
        
        // If there is no ContentTheme or we are applying a different ContentTheme, remove any previously applied ContentTheme
        if (oldContentTheme && oldContentTheme !== contentTheme) {
            iframe.classList.remove(oldContentTheme);
            if (kiwixJSSheet) {
                kiwixJSSheet.disabled = true;
                kiwixJSSheet.parentNode.removeChild(kiwixJSSheet);
            }
        }
        // Apply the requested ContentTheme (if not already attached)
        if (contentTheme && (!kiwixJSSheet || !~kiwixJSSheet.href.search('kiwixJS' + contentTheme + '.css'))) {
            iframe.classList.add(contentTheme);
            // Use an absolute reference because Service Worker needs this (if an article loaded in SW mode is in a ZIM
            // subdirectory, then relative links injected into the article will not work as expected)
            // Note that location.pathname returns the path plus the filename, but is useful because it removes any query string
            var prefix = (window.location.protocol + '//' + window.location.host + window.location.pathname).replace(/\/[^/]*$/, '');
            if (doc) {
                var link = doc.createElement('link');
                link.setAttribute('id', 'kiwixJSTheme');
                link.setAttribute('rel', 'stylesheet');
                link.setAttribute('type', 'text/css');
                link.setAttribute('href', prefix + '/css/kiwixJS' + contentTheme + '.css');
                doc.head.appendChild(link);
            }
        }
        // If we are in Config and a real document has been loaded already, expose return link so user can see the result of the change
        // DEV: The Placeholder string below matches the dummy article.html that is loaded before any articles are loaded
        if (document.getElementById('liConfigureNav').classList.contains('active') && doc &&
            doc.title !== "Placeholder for injecting an article into the iframe") {
            showReturnLink();
        }
    }

    // Displays the return link and handles click event. Called by applyAppTheme()
    function showReturnLink() {
        var viewArticle = document.getElementById('viewArticle');
        viewArticle.style.display = 'block';
        viewArticle.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('liConfigureNav').classList.remove('active');
            document.getElementById('liHomeNav').classList.add('active');
            removeAnimationClasses();
            if (params.showUIAnimations) { 
                applyAnimationToSection('home');
            } else {
                document.getElementById('configuration').style.display = 'none';
                document.getElementById('articleContent').style.display = 'block';
            }
            document.getElementById('navigationButtons').style.display = 'inline-flex';
            document.getElementById('formArticleSearch').style.display = 'block';
            viewArticle.style.display = 'none';
        });
    }

    // Reports an error in loading one of the ASM or WASM machines to the UI API Status Panel
    // This can't be done in app.js because the error occurs after the API panel is first displayed
    function reportAssemblerErrorToAPIStatusPanel(decoderType, error, assemblerMachineType) {
        console.error('Could not instantiate any ' + decoderType + ' decoder!', error);
        params.decompressorAPI.assemblerMachineType = assemblerMachineType;
        params.decompressorAPI.errorStatus = 'Error loading ' + decoderType + ' decompressor!';
        var decompAPI = document.getElementById('decompressorAPIStatus');
        decompAPI.innerHTML = 'Decompressor API: ' + params.decompressorAPI.errorStatus;
        decompAPI.className = 'apiBroken';
        document.getElementById('apiStatusDiv').className = 'card card-danger';
    }

    // If global variable webpMachine is true (set in init.js), then we need to initialize the WebP Polyfill
    if (webpMachine) webpMachine = new webpHero.WebpMachine();

    /**
     * Functions and classes exposed by this module
     */
    return {
        feedNodeWithBlob: feedNodeWithBlob,
        replaceCSSLinkWithInlineCSS: replaceCSSLinkWithInlineCSS,
        deriveZimUrlFromRelativeUrl: deriveZimUrlFromRelativeUrl,
        removeUrlParameters: removeUrlParameters,
        displayActiveContentWarning: displayActiveContentWarning,
        displayFileDownloadAlert: displayFileDownloadAlert,
        checkUpdateStatus: checkUpdateStatus,
        checkServerIsAccessible: checkServerIsAccessible,
        spinnerDisplay: spinnerDisplay,
        isElementInView: isElementInView,
        removeAnimationClasses: removeAnimationClasses,
        applyAnimationToSection: applyAnimationToSection,
        applyAppTheme: applyAppTheme,
        reportAssemblerErrorToAPIStatusPanel: reportAssemblerErrorToAPIStatusPanel
    };
});
