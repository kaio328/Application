(function() {

L.Control.Search = L.Control.extend({
	includes: L.Mixin.Events,

	options: {
		url: '',					//url for search by ajax request, ex: "search.php?q={s}". Can be function that returns string for dynamic parameter setting
		layer: null,				//layer where search markers(is a L.LayerGroup)				
		sourceData: null,			//function that fill _recordsCache, passed searching text by first param and callback in second				
		jsonpParam: null,			//jsonp param name for search by jsonp service, ex: "callback"
		propertyLoc: 'loc',			//field for remapping location, using array: ['latname','lonname'] for select double fields(ex. ['lat','lon'] ) support dotted format: 'prop.subprop.title'
		propertyName: '',			//property in marker.options(or feature.properties for vector layer) trough filter elements in layer,
		featuresArray: [],
		formatData: null,			//callback for reformat all data from source to indexed data object
		filterData: null,			//callback for filtering data from text searched, params: textSearch, allRecords
		buildTip: null,				//function that return row tip html node(or html string), receive text tooltip in first param
		container: '',				//container id to insert Search Control		
		minLength: 1,				//minimal text length for autocomplete
		initial: true,				//search elements only by initial text
		casesesitive: false,		//search elements in case sensitive text
		autoType: true,				//complete input with first suggested result and select this filled-in text.
		delayType: 0,				//delay while typing for show tooltip
		tooltipLimit: -1,			//limit max results to show in tooltip. -1 for no limit.
		tipAutoSubmit: true,		//auto map panTo when click on tooltip
		autoResize: true,			//autoresize on input change
		collapsed: true,			//collapse search control at startup
		autoCollapse: false,		//collapse search control after submit(on button or on tips if enabled tipAutoSubmit)
		autoCollapseTime: 1200,		//delay for autoclosing alert and collapse after blur
		zoom: null,					//zoom after pan to location found, default: map.getZoom()
		position: 'topleft',
		textErr: 'Kein Treffer!',	//error message
		textCancel: 'Abbrechen',	//title in cancel button		
		textPlaceholder: '',		//placeholder value			
		animateLocation: true,		//animate a circle over location found
		circleLocation: false,		//draw a circle in location found
		markerLocation: false,		//draw a marker in location found
		markerIcon: new L.Icon.Default//({iconUrl: "css/images/marker-icon.png",  shadowUrl: "css/images/marker-shadow.png"})
										//--> seit neuem leaflet nicht mehr notwendig 
			
	},

	
	initialize: function(options) {
		L.Util.setOptions(this, options || {});
		this._inputMinSize = this.options.textPlaceholder ? this.options.textPlaceholder.length : 10;
		this._layer = this.options.layer || new L.LayerGroup();
		this._filterData = this.options.filterData || this._defaultFilterData;
		this._formatData = this.options.formatData || this._defaultFormatData;
		this._autoTypeTmp = this.options.autoType;	
		this._countertips = 0;		
		this._recordsCache = {};
		this._curReq = null;
		this._featuresToSearch = this.options.featuresArray;
	},

	onAdd: function (map) {
		this._map = map;
		this._container = L.DomUtil.create('div', 'leaflet-control-search');
		this._input = this._createInput(this.options.textPlaceholder, 'search-input');
		this._tooltip = this._createTooltip('search-tooltip');
		this._cancel = this._createCancel(this.options.textCancel, 'search-cancel');
		this._button = this._createButton(this.options.textPlaceholder, 'search-button');
		this._alert = this._createAlert('search-alert');
		this._test = this._createButton(this.options.textPlaceholder, 'test-button');


		if(this.options.collapsed===false)
			this.expand(this.options.collapsed);

		if(this.options.circleLocation || this.options.markerLocation || this.options.markerIcon)
			this._markerLoc = new L.Control.Search.Marker([0,0], {
					showCircle: this.options.circleLocation,
					showMarker: this.options.markerLocation,
					icon: this.options.markerIcon
				});
		
		this.setLayer( this._layer );
		 map.on({


		     'resize': this._handleAutoresize
		 	}, this);
		return this._container;
	},
	addTo: function (map) {

		if(this.options.container) {
			this._container = this.onAdd(map);
			this._wrapper = L.DomUtil.get(this.options.container);
			this._wrapper.style.position = 'relative';
			this._wrapper.appendChild(this._container);
		}
		else
			L.Control.prototype.addTo.call(this, map);

		return this;
	},

	onRemove: function(map) {
		this._recordsCache = {};
	},


	_getPath: function(obj, prop) {
		var parts = prop.split('.'),
			last = parts.pop(),
			len = parts.length,
			cur = parts[0],
			i = 1;

		if(len > 0)
			while((obj = obj[cur]) && i < len)
				cur = parts[i++];

		if(obj)
			return obj[last];
	},

	setLayer: function(layer) {
		this._layer = layer;
		this._layer.addTo(this._map);
		if(this._markerLoc)
			this._layer.addLayer(this._markerLoc);
		return this;
	},
	
	showAlert: function(text) {
		text = text || this.options.textErr;
		this._alert.style.display = 'block';
		this._alert.innerHTML = text;
		clearTimeout(this.timerAlert);
		var that = this;		
		this.timerAlert = setTimeout(function() {
			that.hideAlert();
		},this.options.autoCollapseTime);
		return this;
	},
	
	hideAlert: function() {
		this._alert.style.display = 'none';
		return this;
	},
		
	cancel: function() {
		//this._map.removeLayer(marker);
		this._input.value = '';
		this._handleKeypress({keyCode:8});
		this._input.size = this._inputMinSize;
		this._input.focus();
		this._cancel.style.display = 'none';
		this._hideTooltip();
		//this._markerLoc.hide(); 
		sidebar.hide();
		this._map.closePopup();
		//this._layer.setStyle({fillColor: 'blue', color: 'blue'});
		return this;
	},
	
	expand: function(toggle) {
		toggle = typeof toggle === 'boolean' ? toggle : true;
		this._input.style.display = 'block';
		L.DomUtil.addClass(this._container, 'search-exp');
		if ( toggle !== false ) {
			this._input.focus();
			this._map.on('dragstart click', this.collapse, this);
		}
		this.fire('search_expanded');
		return this;	
	},

	collapse: function() {
		this._hideTooltip();
		//this.cancel();
		this._alert.style.display = 'none';
		this._input.blur();
		if(this.options.collapsed)
		{
			this._input.style.display = 'none';								/* ENTFERNEN DAMIT Such-Input-Feld BEI CLICK NICHT ENTFERNT WIRD */
			/*	this._cancel.style.display = 'none';						/* ENTFERNEN DAMIT Cancel NICHT ENTFERNT WIRD */
			L.DomUtil.removeClass(this._container, 'search-exp');		
			/*	this._markerLoc.hide();                                     /* ENTFERNEN DAMIT MARKER BEI CLICK NICHT ENTFERNT WERDEN */
			this._map.off('dragstart click', this.collapse, this);
		}
		this.fire('search_collapsed');
		return this;
	},
	
	collapseDelayed: function() {
		if (!this.options.autoCollapse) return this;
		var that = this;
		clearTimeout(this.timerCollapse);
		this.timerCollapse = setTimeout(function() {
			that.collapse();
		}, this.options.autoCollapseTime);
		return this;		
	},

	collapseDelayedStop: function() {
		clearTimeout(this.timerCollapse);
		return this;		
	},


	_createAlert: function(className) {
		var alert = L.DomUtil.create('div', className, this._container);
		alert.style.display = 'none';

		L.DomEvent
			.on(alert, 'click', L.DomEvent.stop, this)
			.on(alert, 'click', this.hideAlert, this);

		return alert;
	},

	_createInput: function (text, className) {
		var label = L.DomUtil.create('label', className, this._container);
		var input = L.DomUtil.create('input', className, this._container);
		input.type = 'text';
		input.size = this._inputMinSize;
		input.value = '';
		input.autocomplete = 'off';
		input.autocorrect = 'off';
		input.autocapitalize = 'off';
		input.placeholder = text;
		input.style.display = 'none';
		input.role = 'search';
		input.id = input.role + input.type + input.size;
		
		label.htmlFor = input.id;
		label.style.display = 'none';
		label.value = text;
		
		L.DomEvent
			.disableClickPropagation(input)
			.on(input, 'keyup', this._handleKeypress, this)
			.on(input, 'keydown', this._handleAutoresize, this)
			.on(input, 'blur', this.collapseDelayed, this)
			.on(input, 'focus', this.collapseDelayedStop, this);
		
		return input;
	},

	_createCancel: function (title, className) {
		var cancel = L.DomUtil.create('a', className, this._container);
		cancel.href = '#';
		cancel.title = title;
		cancel.style.display = 'none';
		cancel.innerHTML = "<span>&otimes;</span>";

		L.DomEvent
			.on(cancel, 'click', L.DomEvent.stop, this)
			.on(cancel, 'click', this.cancel, this);

		return cancel;
	},
	
	_createButton: function (title, className) {
		var button = L.DomUtil.create('a', className, this._container);
		button.href = '#';
		button.title = title;

		L.DomEvent
			.on(button, 'click', L.DomEvent.stop, this)
			.on(button, 'click', this._handleSubmit, this)			
			.on(button, 'focus', this.collapseDelayedStop, this)
			.on(button, 'blur', this.collapseDelayed, this);

		return button;
	},

	_createTooltip: function(className) {
		var tool = L.DomUtil.create('ul', className, this._container);
		tool.style.display = 'none';

		var that = this;
		L.DomEvent
			.disableClickPropagation(tool)
			.on(tool, 'blur', this.collapseDelayed, this)
			.on(tool, 'mousewheel', function(e) {
				that.collapseDelayedStop();
				L.DomEvent.stopPropagation(e);
			}, this)
			.on(tool, 'mouseover', function(e) {
				that.collapseDelayedStop();
			}, this);
		return tool;
	},

	_createTip: function(text, val) {
		var tip;
		
		if(this.options.buildTip)
		{
			tip = this.options.buildTip.call(this, text, val); 
			if(typeof tip === 'string')
			{
				var tmpNode = L.DomUtil.create('div');
				tmpNode.innerHTML = tip;
				tip = tmpNode.firstChild;
			}
		}
		else
		{
			tip = L.DomUtil.create('li', '');
			tip.innerHTML = text;
		}
		
		L.DomUtil.addClass(tip, 'search-tip');
		tip._text = text; 

		if(this.options.tipAutoSubmit)
			L.DomEvent
				.disableClickPropagation(tip)		
				.on(tip, 'click', L.DomEvent.stop, this)
				.on(tip, 'click', function(e) {
					this._input.value = text;
					this._handleAutoresize();
					this._input.focus();
					this._hideTooltip();	
					this._handleSubmit();
				}, this);

		return tip;
	},


	_getUrl: function(text) {
		return (typeof this.options.url === 'function') ? this.options.url(text) : this.options.url;
	},

	_defaultFilterData: function(text, records) {
	
		var regFilter = new RegExp("^[.]$|[\[\]|()*]",'g'),	
			I, regSearch,
			frecords = {};

		text = text.replace(regFilter,'');	  
		I = this.options.initial ? '^' : '';  

		regSearch = new RegExp(I + text, !this.options.casesesitive ? 'i' : undefined);


		for(var key in records)
			if( regSearch.test(key) )
				frecords[key]= records[key];
		
		return frecords;
	},

	showTooltip: function(records) {
		var tip;

		this._countertips = 0;
				
		this._tooltip.innerHTML = '';
		this._tooltip.currentSelection = -1;  

		for(var key in records)
		{
			if(++this._countertips == this.options.tooltipLimit) break;

			tip = this._createTip(key, records[key] );

			this._tooltip.appendChild(tip);
		}
		
		if(this._countertips > 0)
		{
			this._tooltip.style.display = 'block';
			if(this._autoTypeTmp)
				this._autoType();
			this._autoTypeTmp = this.options.autoType;
		}
		else
			this._hideTooltip();

		this._tooltip.scrollTop = 0;
		return this._countertips;
	},

	_hideTooltip: function() {
		this._tooltip.style.display = 'none';
		this._tooltip.innerHTML = '';
		return 0;
	},

	_defaultFormatData: function(json) {	
		var propName = this.options.propertyName,
			propLoc = this.options.propertyLoc,
			i, jsonret = {};

		if( L.Util.isArray(propLoc) )
			for(i in json)
				jsonret[ this._getPath(json[i],propName) ]= L.latLng( json[i][ propLoc[0] ], json[i][ propLoc[1] ] );
		else
			for(i in json)
				jsonret[ this._getPath(json[i],propName) ]= L.latLng( this._getPath(json[i],propLoc) );

		return jsonret;
	},

	_recordsFromJsonp: function(text, callAfter) {  
		L.Control.Search.callJsonp = callAfter;
		var script = L.DomUtil.create('script','leaflet-search-jsonp', document.getElementsByTagName('body')[0] ),			
			url = L.Util.template(this._getUrl(text)+'&'+this.options.jsonpParam+'=L.Control.Search.callJsonp', {s: text}); 

		script.type = 'text/javascript';
		script.src = url;
		return { abort: function() { script.parentNode.removeChild(script); } };
	},

	_recordsFromAjax: function(text, callAfter) {	
		if (window.XMLHttpRequest === undefined) {
			window.XMLHttpRequest = function() {
				try { return new ActiveXObject("Microsoft.XMLHTTP.6.0"); }
				catch  (e1) {
					try { return new ActiveXObject("Microsoft.XMLHTTP.3.0"); }
					catch (e2) { throw new Error("XMLHttpRequest is not supported"); }
				}
			};
		}
		var IE8or9 = ( L.Browser.ie && !window.atob && document.querySelector ),
			request = IE8or9 ? new XDomainRequest() : new XMLHttpRequest(),
			url = L.Util.template(this._getUrl(text), {s: text});
	
		
		request.open("GET", url);
		var that = this;

		request.onload = function() {
			callAfter( JSON.parse(request.responseText) );
		};
		request.onreadystatechange = function() {
		    if(request.readyState === 4 && request.status === 200) {
		    	this.onload();
		    }
		};

		request.send();
		return request;   
	},
	
	_recordsFromLayer: function() {	
		var that = this,
			retRecords = {},
			propName = this.options.propertyName,
			loc;
		
		this._layer.eachLayer(function(layer) {

			if(layer instanceof L.Control.Search.Marker) return;

			if(layer instanceof L.Marker || layer instanceof L.CircleMarker)
			{
				if(that._getPath(layer.options,propName))
				{
					loc = layer.getLatLng();
					loc.layer = layer;
					retRecords[ that._getPath(layer.options,propName) ] = loc;			
					
				}
				else if(that._getPath(layer.feature.properties,propName)){

					loc = layer.getLatLng();
					loc.layer = layer;
					retRecords[ that._getPath(layer.feature.properties,propName) ] = loc;
					
				}
				else
					throw new Error("propertyName '"+propName+"' not found in marker");
			}
            else if(layer.hasOwnProperty('feature'))
			{
				if(layer.feature.properties.hasOwnProperty(propName))
				{
					loc = layer.getBounds().getCenter();
					loc.layer = layer;			
					retRecords[ layer.feature.properties[propName] ] = loc;
				}
				else
					throw new Error("propertyName '"+propName+"' not found in feature");
			}
			else if(layer instanceof L.LayerGroup)
            {

                layer.eachLayer(function(m) {
                    loc = m.getLatLng();
                    loc.layer = m;
                    retRecords[ m.feature.properties[propName] ] = loc;
                });
            }
			
		},this);
		
		return retRecords;
	},

	_autoType: function() {
		

		
		var start = this._input.value.length,
			firstRecord = this._tooltip.firstChild._text,
			end = firstRecord.length;

		if (firstRecord.indexOf(this._input.value) === 0) { 
			this._input.value = firstRecord;
			this._handleAutoresize();

			if (this._input.createTextRange) {
				var selRange = this._input.createTextRange();
				selRange.collapse(true);
				selRange.moveStart('character', start);
				selRange.moveEnd('character', end);
				selRange.select();
			}
			else if(this._input.setSelectionRange) {
				this._input.setSelectionRange(start, end);
			}
			else if(this._input.selectionStart) {
				this._input.selectionStart = start;
				this._input.selectionEnd = end;
			}
		}
	},

	_hideAutoType: function() {	

		var sel;
		if ((sel = this._input.selection) && sel.empty) {
			sel.empty();
		}
		else if (this._input.createTextRange) {
			sel = this._input.createTextRange();
			sel.collapse(true);
			var end = this._input.value.length;
			sel.moveStart('character', end);
			sel.moveEnd('character', end);
			sel.select();
		}
		else {
			if (this._input.getSelection) {
				this._input.getSelection().removeAllRanges();
			}
			this._input.selectionStart = this._input.selectionEnd;
		}
	},
	
	_handleKeypress: function (e) {	
		
		switch(e.keyCode)
		{
			case 27: //Escape
				this.collapse();
			break;
			case 13: //Enter
				if(this._countertips == 1)
					this._handleArrowSelect(1);
				this._handleSubmit();	
			break;
			case 38: // Up
				this._handleArrowSelect(-1);
			break;
			case 40: //Down
				this._handleArrowSelect(1);
			break;
			case  8://Backspace
			case 45://Insert 
			case 46://Delete
				//this._autoTypeTmp = false;//disable temporarily autoType
			break;
			case 37://Left
			case 39://Right
			case 16://Shift
			case 17://Ctrl
			case 35://End
			case 36://Home
			break;
			default:

				if(this._input.value.length)
					this._cancel.style.display = 'block';
				else
					this._cancel.style.display = 'none';

				if(this._input.value.length >= this.options.minLength)
				{
					var that = this;

					clearTimeout(this.timerKeypress);	//cancel last search request while type in				
					this.timerKeypress = setTimeout(function() {	//delay before request, for limit jsonp/ajax request

						that._fillRecordsCache();
					
					}, this.options.delayType);
				}
				else
					this._hideTooltip();
		}
	},

	searchText: function(text) {
		var code = text.charCodeAt(text.length);

		this._input.value = text;

		this._input.style.display = 'block';
		L.DomUtil.addClass(this._container, 'search-exp');

		this._autoTypeTmp = false;

		this._handleKeypress({keyCode: code});
	},
	
	_fillRecordsCache: function() {
	
		var inputText = this._input.value,
			that = this, records;

		if(this._curReq && this._curReq.abort)
			this._curReq.abort();


		L.DomUtil.addClass(this._container, 'search-load');	

		if(this.options.layer)
		{

			this._recordsCache = this._recordsFromLayer();
			
			records = this._filterData( this._input.value, this._recordsCache );

			this.showTooltip( records );

			L.DomUtil.removeClass(this._container, 'search-load');
		}
		else
		{
			if(this.options.sourceData)
				this._retrieveData = this.options.sourceData;

			else if(this.options.url)
				this._retrieveData = this.options.jsonpParam ? this._recordsFromJsonp : this._recordsFromAjax;

			this._curReq = this._retrieveData.call(this, inputText, function(data) {
				
				that._recordsCache = that._formatData(data);

	
				if(that.options.sourceData)
					records = that._filterData( that._input.value, that._recordsCache );
				else
					records = that._recordsCache;

				that.showTooltip( records );
 
				L.DomUtil.removeClass(that._container, 'search-load');
			});
		}
	},
	
	_handleAutoresize: function() {	

	    if (this._input.style.maxWidth != this._map._container.offsetWidth) 
	        this._input.style.maxWidth = L.DomUtil.getStyle(this._map._container, 'width');

		if(this.options.autoResize && (this._container.offsetWidth + 45 < this._map._container.offsetWidth))
			this._input.size = this._input.value.length<this._inputMinSize ? this._inputMinSize : this._input.value.length;
	},

	_handleArrowSelect: function(velocity) {
	
		var searchTips = this._tooltip.hasChildNodes() ? this._tooltip.childNodes : [];
			
		for (i=0; i<searchTips.length; i++)
			L.DomUtil.removeClass(searchTips[i], 'search-tip-select');
		
		if ((velocity == 1 ) && (this._tooltip.currentSelection >= (searchTips.length - 1))) {
			L.DomUtil.addClass(searchTips[this._tooltip.currentSelection], 'search-tip-select');
		}
		else if ((velocity == -1 ) && (this._tooltip.currentSelection <= 0)) {
			this._tooltip.currentSelection = -1;
		}
		else if (this._tooltip.style.display != 'none') {
			this._tooltip.currentSelection += velocity;
			
			L.DomUtil.addClass(searchTips[this._tooltip.currentSelection], 'search-tip-select');
			
			this._input.value = searchTips[this._tooltip.currentSelection]._text;

			// scroll:
			var tipOffsetTop = searchTips[this._tooltip.currentSelection].offsetTop;
			
			if (tipOffsetTop + searchTips[this._tooltip.currentSelection].clientHeight >= this._tooltip.scrollTop + this._tooltip.clientHeight) {
				this._tooltip.scrollTop = tipOffsetTop - this._tooltip.clientHeight + searchTips[this._tooltip.currentSelection].clientHeight;
			}
			else if (tipOffsetTop <= this._tooltip.scrollTop) {
				this._tooltip.scrollTop = tipOffsetTop;
			}
		}
	},

	_handleSubmit: function() {	

		this._hideAutoType();
		
		this.hideAlert();
		this._hideTooltip();

		
		if(this._input.style.display == 'none')	
			this.expand();
		else
		{
			if(this._input.value === '')
				this.collapse();
			else
			{
				var loc = this._getLocation(this._input.value);
				
				if(loc===false)
					this.showAlert();
				else
				{
					this.showLocation(loc, this._input.value);					
					this.fire('search_locationfound', {
							latlng: loc,
							text: this._input.value,
							layer: loc.layer ? loc.layer : null
						});
				}

			}
		}
	},

	_getLocation: function(key) {	

		if( this._recordsCache.hasOwnProperty(key) )
			return this._recordsCache[key];
		else
			return false;
	},

	showLocation: function(latlng, title) {	
		if(this.options.zoom)
			this._map.setView(latlng, this.options.zoom);
		
			this._map.panTo(latlng);                            /* -------> wenn aus = kein pan zum gefunden Punkt! Heeeeerber Typ :D:D */                            

		if(this._markerLoc)
		{
			//clearTimeout(this._markerLoc);
			var that = this;
			this._markerLoc.setLatLng(latlng);  
			this._markerLoc.setTitle(title);
			this._markerLoc.show(), setTimeout(function() {		//Timeoute setzen: Marker verschwindet nach eingegebener Zeit wieder von automatisch Hier: 1,25 Sekunden
			that._markerLoc.hide();
			}, 1250);
			//this._markerLoc.bindPopup(title);
			
			if(this.options.animateLocation)
				this._markerLoc.animate();
	
		}
		
		if(this.options.autoCollapse)
			this.collapse();
		return this;
	}
});

L.Control.Search.Marker = L.Marker.extend({     	/* HIER KANN DER MARKER BEARBEITET WERDEN!!!!!!!!!*/

	includes: L.Mixin.Events,
	
	options: {
		radius: 12,
		weight: 3,
		color: 'red',
		stroke: true,
		fill: false,
		title: '',
		icon: new L.Icon.Default(),
		showCircle: true,
		showMarker: true	
	},
	
	initialize: function (latlng, options) {
		L.setOptions(this, options);
		L.Marker.prototype.initialize.call(this, latlng, options);
		if(this.options.showCircle)
			this._circleLoc =  new L.CircleMarker(latlng, this.options);
	},

	onAdd: function (map) {
		L.Marker.prototype.onAdd.call(this, map);
		if(this._circleLoc)
			map.addLayer(this._circleLoc);
		this.hide();
	},

	onRemove: function (map) {
		L.Marker.prototype.onRemove.call(this, map);
		if(this._circleLoc)
			map.removeLayer(this._circleLoc);
	},	
	
	setLatLng: function (latlng) {
		L.Marker.prototype.setLatLng.call(this, latlng);
		if(this._circleLoc)
			this._circleLoc.setLatLng(latlng);
		return this;
	},
	
	setTitle: function(title) {
		title = title || '';
		this.options.title = title;
		if(this._icon)
			this._icon.title = title;
		return this;
	},

	show: function() {
		if(this.options.showMarker)
		{
			if(this._icon)
				this._icon.style.display = 'block';
			if(this._shadow)
				this._shadow.style.display = 'block';
			this._bringToFront();
		}
		if(this._circleLoc)
		{
			this._circleLoc.setStyle({fill: this.options.fill, stroke: this.options.stroke});
			this._circleLoc.bringToFront();
		}
		return this;
	},

	hide: function() {
		if(this._icon)
			this._icon.style.display = 'none';
		if(this._shadow)
			this._shadow.style.display = 'none';
		if(this._circleLoc)			
			this._circleLoc.setStyle({fill: false, stroke: false});
		return this;
	},

	animate: function() {

		if(this._circleLoc)
		{
			var circle = this._circleLoc,
				tInt = 200,	
				ss = 10,	
				mr = parseInt(circle._radius/ss),
				oldrad = this.options.radius,
				newrad = circle._radius * 2.5,
				acc = 0;

			circle._timerAnimLoc = setInterval(function() {
				acc += 0.5;
				mr += acc;	
				newrad -= mr;
				
				circle.setRadius(newrad);

				if(newrad<oldrad)
				{
					clearInterval(circle._timerAnimLoc);
					circle.setRadius(oldrad);

				}
			}, tInt);
		}
		
		return this;
	}
});

L.Map.addInitHook(function () {
    if (this.options.searchControl) {
        this.searchControl = L.control.search(this.options.searchControl);
        this.addControl(this.searchControl);
    }
});

L.control.search = function (options) {
    return new L.Control.Search(options);
};

}).call(this);

