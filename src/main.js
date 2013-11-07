define([
    'streamhub-map/views/overlay-view',
    'streamhub-map/views/overlay-factory',
    'streamhub-sdk/views/list-view',
    'json!streamhub-map-resources/world-50m.json',
    'd3',
    'topojson',
    'inherits'
], function (
    OverlayView,
    OverlayViewFactory,
    ListView,
    WorldJson,
    d3,
    topojson,
    inherits) {

    /**
     * A view to visualize StreamHub content on a map
     * @constructor
     * @param [opts] {Object} Configuration options for the MapView
     * @param [opts.projection='mercator'] {String} A map projection supported by the D3 library (https://github.com/mbostock/d3/wiki/Geo-Projections#standard-projections)
     * @param [opts.mapCenter] {Array} The lat/lon coordinates of the center of the map
     * @param [opts.boundingBox] {Array} The NW and SE coordinates of the bounding box that defines the scope of the visible map
     * @param [opts.graticule=false] {Boolean} Whether to display the map graticule
     * @param [opts.graticuleColor] {String} The color of the graticule
     * @param [opts.landColor] {String} The foreground colour of the map
     * @param [opts.includeAntarctica=false] {Boolean} Whether to include the continent of Antarctica on the map
     */
    var MapView = function (opts) {
        var opts = opts || {};
        this._projectionType = opts.projection || 'mercator';
        this._projection = new d3.geo[this._projectionType]();
        this._mapCenter = opts.mapCenter;
        this._boundingBox = opts.boundingBox;
        this._graticule = opts.graticule || false;
        this._landColor = opts.landColor;
        this._graticuleColor = opts.graticuleColor;
        this._includeAntarctica = opts.includeAntarctica || false;
        this._overlayViews = [];
        this._dataPoints = [];

        ListView.call(this, opts);

        this._draw();
        this._overlayViewFactory = new OverlayViewFactory({
            mapContext: this.getMapContext()
        });

        var self = this;
        $(window).on('resize', function (e) {
            for (var i=0; i < self._overlayViews.length; i++) {
                if (self._overlayViews[i]._animating) {
                    self._overlayViews[i]._animating = false;
                }
            }
            self._clearOverlays();
            self._draw();
        });
    };
    inherits(MapView, ListView);

    MapView.prototype.mapClassName = 'hub-map';
    MapView.prototype.mapOverlayLayerClassName = 'hub-map-overlays';
    MapView.prototype.mapLayerClassName = 'hub-map-layer';
    MapView.prototype.mapLandClassName = 'hub-map-land';
    MapView.prototype.mapGraticuleClassName = 'hub-map-graticule';
    MapView.prototype.className = 'hub-map-view';

    MapView.prototype.getMapContext = function () {
        return this._mapContext;
    };

    MapView.prototype.addLayer = function (name) {
        return this._mapContext.svg.append('svg:g')
            .attr('class', this.mapLayerClassName)
            .attr('class', name);
    };

    MapView.prototype.addDataPoint = function (dataPoint) {
        this._dataPoints.push(dataPoint);
        var overlayView = this._createOverlayView(dataPoint);
        this.addOverlay(overlayView);
    };

    MapView.prototype._createOverlayView = function (dataPoint) {
        return this._overlayViewFactory.createOverlayView(dataPoint);
    };

    MapView.prototype._createMapContext = function () {
        var mapSvg = d3.select('.hub-map-svg');
        if (! mapSvg[0][0]) {
            mapSvg = d3.select(this.listElSelector).append('svg')
                .attr('class', 'hub-map-svg');
        }
        return {
            path: this._getPathForProjection(),
            svg: mapSvg
        };
    };

    MapView.prototype._draw = function () {
        this._mapContext = this._createMapContext();
        this._drawMap();
        this._drawOverlays();
    };

    // Scale the map (http://stackoverflow.com/a/14691788)
    MapView.prototype._drawMap = function () {
        var width = this.$el.width(),
            height = this.$el.height();

        // Country ids map to ISO 3166-1 code
        // (http://en.wikipedia.org/wiki/ISO_3166-1_numeric)
        var countries = topojson.feature(WorldJson, WorldJson.objects.countries).features;
        if (! this._includeAntarctica) {
            countries = countries.filter(function (feature) {
                if (feature.id === 10) {
                    delete feature;
                }
                return feature.id !== 10;
            });
        }

        // Append the SVG element with which the map will be drawn on.
        if (this._mapEl) {
            this._mapEl.remove();
        }
        if (this._mapOverlayEl) {
            this._mapEl = this._mapContext.svg
                .insert('svg:g', '.hub-map-overlays')
                .attr('class', 'hub-map');
        } else {
            this._mapEl = this._mapContext.svg.append('svg:g')
                .attr('class', 'hub-map');
        }

        // Draw the path of the map in SVG.
        this._mapEl.selectAll('.'+this.mapLandClassName)
           .data(countries)
           .enter()
           .insert("path")
           .attr("class", this.mapLandClassName)
           .attr("d", this._mapContext.path); 

        // Draw graticule
        if (this._graticule) {
            var graticule = d3.geo.graticule();

            // Draw the path for the graticule
            this._mapEl.append("path")
                .attr("class", "hub-map-graticule")
                .datum(graticule)
                .attr("d", this._mapContext.path);

            // Draw the path for the bounding outline of the graticule
            this._mapEl.append("path")
                .datum(graticule.outline)
                .attr("class", this.mapLandClassName)
                .attr("d", this._mapContext.path);
        }
    };

    MapView.prototype._clearOverlays = function () {
        for (var i=0; i < this._overlayViews.length; i++) {
            var overlayView = this._overlayViews[i];
            overlayView.destroy();
        }
    };

    MapView.prototype.add = function (point) {
        this.addDataPoint(point);
    };

    MapView.prototype._drawOverlays = function () {
        if (! this._overlaysPath) {
            this._overlaysPath = this._getPathForProjection();
        }

        // Append the SVG element with which the map will be drawn on.
        if (! this._mapOverlayEl) {
            this._mapOverlayEl = this.addLayer('hub-map-overlays');
        }
        for (var i=0; i < this._overlayViews.length; i++) {
            var overlayView = this._overlayViews[i];
            if (! overlayView._rendered) {
                this._overlayViews[i].setMapContext({ el: this.el, path: this._overlaysPath, svg: this._mapOverlayEl });
                this._overlayViews[i].render();
            }
        }
    };

    MapView.prototype._getPathForProjection = function () {
        var width = this.$el.width(),
            height = this.$el.height();
        this._projection
            .scale((width + 1) / 2 / Math.PI)
            .center([0, this._includeAntarctica ? 0 :27.55]) // Update center of map when Antarctica is removed
            .translate([width / 2, height / 2]); // Place the center, and the midpoint of the container

        return d3.geo.path().projection(this._projection)
    };

    MapView.prototype.addOverlay = function (overlayView) {
        this._overlayViews.push(overlayView);
        this._drawOverlays();
        return this;
    };

    return MapView;
});
