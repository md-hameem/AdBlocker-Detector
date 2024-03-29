"use strict";
// copyright https://github.com/md-hameem
(function(win) {

	var ENABLE_ANALYTICS = true;
	var GA_TRACKING_ID = ''; 
	var analytics = {}; 

	var ofs = 'offset', cl = 'client';
	var noop = function(){};

	var testedOnce = false;
	var testExecuting = false;

	var isOldIEevents = (win.addEventListener === undefined);

	var _options = {
		loopDelay: 50,
		maxLoop: 5,
		testRemoteList: true,
		debug: true,
		useLocalBait: true,
		blockLists: [],
		found: noop, 				
		notfound: noop, 			
		complete: noop  			
	}

	function parseAsJson(data){
		var result, fnData;
		try{
			result = JSON.parse(data);
		}
		catch(ex){
			try{
				fnData = new Function("return " + data);
				result = fnData();
			}
			catch(ex){
				log('Failed secondary JSON parse', true);
			}
		}

		return result;
	}

	
	var AjaxHelper = function(opts){
		var xhr = new XMLHttpRequest();

		this.success = opts.success || noop;
		this.fail = opts.fail || noop;
		var me = this;

		var method = opts.method || 'get';

		this.abort = function(){
			try{
				xhr.abort();
			}
			catch(ex){
			}
		}

		function stateChange(vals){
			if(xhr.readyState == 4){
				if(xhr.status == 200){
					me.success(xhr.response);
				}
				else{
					// failed
					me.fail(xhr.status);
				}
			}
		}

		xhr.onreadystatechange = stateChange;

		function start(){
			xhr.open(method, opts.url, true);
			xhr.send();
		}

		start();
	}

	class BlockListTracker {
		constructor() {
			var me = this;
			var externalBlocklistData = {};


			this.addUrl = function (url) {
				externalBlocklistData[url] = {
					url: url,
					state: 'pending',
					format: null,
					data: null,
					result: null
				};

				return externalBlocklistData[url];
			};

			this.setResult = function (urlKey, state, data) {
				var obj = externalBlocklistData[urlKey];
				if (obj == null) {
					obj = this.addUrl(urlKey);
				}

				obj.state = state;
				if (data == null) {
					obj.result = null;
					return;
				}

				if (typeof data === 'string') {
					try {
						data = parseAsJson(data);
						obj.format = 'json';
					}
					catch (ex) {
						obj.format = 'easylist';
					}
				}
				obj.data = data;

				return obj;
			};

		}
	}

	var listeners = []; 
	var baitNode = null;
	var quickBait = {
		cssClass: 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links'
	};
	var baitTriggers = {
		nullProps: [ofs + 'Parent'],
		zeroProps: []
	};

	baitTriggers.zeroProps = [
		ofs +'Height', ofs +'Left', ofs +'Top', ofs +'Width', ofs +'Height',
		cl + 'Height', cl + 'Width'
	];

	var exeResult = {
		quick: null,
		remote: null
	};

	var findResult = null; 

	var timerIds = {
		test: 0,
		download: 0
	};

	function isFunc(fn){
		return typeof(fn) == 'function';
	}

	function makeEl(tag, attributes){
		var k, v, el, attr = attributes;
		var d = document;

		el = d.createElement(tag);

		if(attr){
			for(k in attr){
				if(attr.hasOwnProperty(k)){
					el.setAttribute(k, attr[k]);
				}
			}
		}

		return el;
	}

	function attachEventListener(dom, eventName, handler){
		if(isOldIEevents){
			dom.attachEvent('on' + eventName, handler);
		}
		else{
			dom.addEventListener(eventName, handler, false);
		}
	}

	function log(message, isError){
		if(!_options.debug && !isError){
			return;
		}
		if(win.console && win.console.log){
			if(isError){
				console.error('[ABD] ' + message);
			}
			else{
				console.log('[ABD] ' + message);
			}
		}
	}

	var ajaxDownloads = [];

	function loadExecuteUrl(url){
		var ajax, result;
		blockLists.addUrl(url);
		ajax = new AjaxHelper(
			{
				url: url,
				success: function(data){
					log('downloaded file ' + url); 
					result = blockLists.setResult(url, 'success', data);
					try{
						var intervalId = 0,
							retryCount = 0;

						var tryExecuteTest = function(listData){
							if(!testExecuting){
								beginTest(listData, true);
								return true;
							}
							return false;
						}

						if(findResult == true){
							return;
						}

						if(tryExecuteTest(result.data)){
							return;
						}
						else{
							log('Pause before test execution');
							intervalId = setInterval(function(){
								if(tryExecuteTest(result.data) || retryCount++ > 5){
									clearInterval(intervalId);
								}
							}, 250);
						}
					}
					catch(ex){
						log(ex.message + ' url: ' + url, true);
					}
				},
				fail: function(status){
					log(status, true);
					blockLists.setResult(url, 'error', null);
				}
			});

		ajaxDownloads.push(ajax);
	}


	function fetchRemoteLists(){
		var i, url;
		var opts = _options;

		for(i=0;i<opts.blockLists.length;i++){
			url = opts.blockLists[i];
			loadExecuteUrl(url);
		}
	}

	function cancelRemoteDownloads(){
		var i, aj;

		for(i=ajaxDownloads.length-1;i >= 0;i--){
			aj = ajaxDownloads.pop();
			aj.abort();
		}
	}

	function beginTest(bait, isRemote){

		if(findResult == true){
			return; 
		}
		testExecuting = true;
		castBait(bait);

		if(!isRemote){
			exeResult.quick = 'testing';
		}
		else {
			exeResult.remote = 'testing';
		}

		timerIds.test = setTimeout(
			function(){ reelIn(bait, 1); },
			5);

		if(!isRemote && _options.testRemoteList){
			fetchRemoteLists();
		}
	}

	function castBait(bait){

		var i, d = document, b = d.body;
		var t;
		var baitStyle = 'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -1000px !important;'

		if(bait == null || typeof(bait) == 'string'){
			log('invalid bait being cast');
			return;
		}

		if(bait.style != null){
			baitStyle += bait.style;
		}

		baitNode = makeEl('div', {
			'class': bait.cssClass,
			'style': baitStyle
		});

		log('adding bait node to DOM');
		b.appendChild(baitNode);

		for(i=0;i<baitTriggers.nullProps.length;i++){
			t = baitNode[baitTriggers.nullProps[i]];
		}
		for(i=0;i<baitTriggers.zeroProps.length;i++){
			t = baitNode[baitTriggers.zeroProps[i]];
		}
	}

	function reelIn(bait, attemptNum){
		var i, k, v;
		var body = document.body;
		var found = false;
		var findTrigger = null;

		if(baitNode == null){
			log('recast bait');
			castBait(bait || quickBait);
		}

		if(typeof(bait) == 'string'){
			log('invalid bait used', true);
			if(clearBaitNode()){
				setTimeout(function(){
					testExecuting = false;
				}, 5);
			}

			return;
		}

		if(timerIds.test > 0){
			clearTimeout(timerIds.test);
			timerIds.test = 0;
		}

		if(body.getAttribute('abp') !== null){
			log('found adblock body attribute');
			found = true;
			findTrigger = 'body_abp_attr';
		}

		if(!found){
			for(i=0;i<baitTriggers.nullProps.length;i++){
				if(baitNode[baitTriggers.nullProps[i]] == null){
					if(attemptNum>4)
						found = true;
					log('found adblock null attr: ' + baitTriggers.nullProps[i]);
					findTrigger = 'div hidden with attribute: null attr-' + baitTriggers.nullProps[i];
					break;
				}
				if(found == true){
					break;
				}
			}

			for(i=0;i<baitTriggers.zeroProps.length;i++){
				if(found == true){
					break;
				}
				if(baitNode[baitTriggers.zeroProps[i]] == 0){
					if(attemptNum>4){
							found = true;
					}
					findTrigger = 'div hidden with attribute: zero_attr-' + baitTriggers.zeroProps[i];
					log('found adblock zero attr: ' + baitTriggers.zeroProps[i]);
				}
				if(baitNode[baitTriggers.zeroProps[i]] == 1){
					findTrigger = 'div visible with attribute: zero_attr-' + baitTriggers.zeroProps[i];
					log('found adblock zero attr: ' + baitTriggers.zeroProps[i]);
				}
			}
		}

		if(!found){
			if(window.getComputedStyle !== undefined) {
				var baitTemp = window.getComputedStyle(baitNode, null);
				if(baitTemp.getPropertyValue('display') == 'none'
				|| baitTemp.getPropertyValue('visibility') == 'hidden') {
					if(attemptNum>4)
					found = true;
					findTrigger = 'computedStyle indicator';
					log('found adblock computedStyle indicator');
				}
			}
		}

		testedOnce = true;
		if(found || attemptNum++ >= _options.maxLoop){
			findResult = found;
			try{
				if(found){
					analytics.blockerDetected(findTrigger, attemptNum);
				}
				else{
					analytics.blockerNotDetected(findTrigger, attemptNum);
				}
			}
			catch(ex){
				log(ex.message);
			}

			log('exiting test loop - value: ' + findResult);
			notifyListeners();
			if(clearBaitNode()){
				setTimeout(function(){
					testExecuting = false;
				}, 5);
			}
		}
		else{
			timerIds.test = setTimeout(function(){
				reelIn(bait, attemptNum);
			}, _options.loopDelay);
		}
	}

	function clearBaitNode(){
		if(baitNode === null){
			return true;
		}

		try{
			if(isFunc(baitNode.remove)){
				baitNode.remove();
			}
			document.body.removeChild(baitNode);
		}
		catch(ex){
		}
		baitNode = null;

		return true;
	}


	function stopFishing(){
		if(timerIds.test > 0){
			clearTimeout(timerIds.test);
		}
		if(timerIds.download > 0){
			clearTimeout(timerIds.download);
		}

		cancelRemoteDownloads();

		clearBaitNode();
	}

	function notifyListeners(){

		var i, funcs;
		if(findResult === null){
			return;
		}
		for(i=0;i<listeners.length;i++){
			funcs = listeners[i];
			try{
				if(funcs != null){
					if(isFunc(funcs['complete'])){
						funcs['complete'](findResult);
					}

					if(findResult && isFunc(funcs['found'])){
						funcs['found']();
					}
					else if(findResult === false && isFunc(funcs['notfound'])){
						funcs['notfound']();
					}
				}
			}
			catch(ex){
				log('Failure in notify listeners ' + ex.Message, true);
			}
		}
	}

	function attachOrFire(){

		var fireNow = false;
		var fn;

		if(document.readyState){
			if(document.readyState == 'complete'){
				fireNow = true;
			}
		}

		fn = function(){
			if(_options.useLocalBait){
				beginTest(quickBait, false);
			}
			else{
				log('ignoreing local bait - download remote');
				fetchRemoteLists();
			}
		}

		if(fireNow){
			fn();
		}
		else{
			attachEventListener(win, 'load', fn);
		}
	}


	var blockLists; 

	var impl = {

		init: function(options){
			var k, v, funcs;

			if(!options){
				return;
			}

			funcs = {
				complete: noop,
				found: noop,
				notfound: noop
			};

			for(k in options){
				if(options.hasOwnProperty(k)){
					if(k == 'complete' || k == 'found' || k == 'notFound'){
						funcs[k.toLowerCase()] = options[k];
					}
					else{
						_options[k] = options[k];
					}
				}
			}

			listeners.push(funcs);

			blockLists = new BlockListTracker();

			attachOrFire();
		}
	}

	win['adblockDetector'] = impl;


	analytics = {
		key: {
			BLOCKER : 'AdBlocker',
			FOUND : 'Found',
			NOT_FOUND: 'NotFound',
			DETECT: 'Detect'
		},

		recordEvent: function(category, action, label, value){
			if(!ENABLE_ANALYTICS){
				return;
			}

			ga('send', 'event', category, action, label, value);

		},

		blockerDetected: function(triggerFound, attemptNum){
			var k = analytics.key;
			analytics.recordEvent(k.DETECT, k.FOUND, triggerFound, attemptNum);
		},

		blockerNotDetected: function(triggerFound, attemptNum){
			var k = analytics.key;
			analytics.recordEvent(k.DETECT, k.NOT_FOUND, triggerFound, attemptNum);
		}

	}


	function initAnalytics(ga_code){

	  (function(i,s,o,g,r,a,m) {i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
	  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
	  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
	  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

	  ga('create', ga_code, 'auto');
	  
	}

	if(ENABLE_ANALYTICS){
		initAnalytics(GA_TRACKING_ID);
	}

})(window)