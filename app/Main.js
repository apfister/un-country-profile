/*global define */

define([
  'dojo/_base/declare',
  'dojo/window',
  'dojo/dom',
  'dojo/dom-class',
  'dojo/dom-construct',
  'dojo/html',
  'dojo/hash',
  'dojo/on',
  'dojo/query',
  'dojo/io-query',
  'dojo/dom-attr',
  'dojo/dom-style',
  'dojo/dom-geometry',
  'dojo/request/xhr',
  'dojo/_base/fx',
  'dojo/fx',
  'dojo/_base/connect',
  'dojo/_base/lang',
  'dojo/Stateful',
  'dojo/ready',

  'ApplicationBase/ApplicationBase',
  'dojo/i18n!./nls/resources',
  'calcite-web',
  'dojo/text!../config/country-lookups.json',
  'dojo/text!../config/sdgs-more-info.json',
  'dojo/text!../config/sdgs-dashboards.json',

  '@esri/arcgis-rest-request',
  '@esri/arcgis-rest-feature-service',
  '@esri/cedar',

  'esri/Map',
  'esri/layers/Layer',
  'esri/layers/VectorTileLayer',
  'esri/layers/GraphicsLayer',
  'esri/Graphic',
  'esri/Basemap',
  'esri/views/MapView',
  'esri/WebMap',
  'esri/core/watchUtils'
], function (
  declare,
  win,
  dom,
  domClass,
  domConstruct,
  html,
  hash,
  on,
  query,
  ioQuery,
  domAttr,
  domStyle,
  domGeometry,
  xhr,
  fx,
  coreFx,
  connect,
  lang,
  Stateful,
  ready,

  ApplicationBase,
  i18n,
  calciteWeb,
  countryLookups,
  sdgsMoreInfo,
  sdgsDashboards,

  agrr,
  agfs,
  cedar,

  Map,
  Layer,
  VectorTileLayer,
  GraphicsLayer,
  Graphic,
  Basemap,
  MapView,
  WebMap,
  watchUtils
) {
  return declare(null, {

    currentFlagClass: 'unitednations',
    profilesInfo: null,

    constructor: function () {
      this.CSS = {
        loading: 'configurable-application--loading'
      };
      this.base = null;
    },

    getMoreSDGInfo: function (goal) {
      return sdgsMoreInfo.filter(item => item.goal === parseInt(goal))[0];
    },

    getCountryLookup: function (code) {
      return countryLookups.filter(item => item['alpha-2'] === code.toUpperCase())[0];
    },

    parseUrlParams: function (urlParams) {
      var foundItem = null;
      if (urlParams && urlParams.country) {
        var inCountry = urlParams.country;
        foundItem = this.getCountryLookup(inCountry);
      }
      return foundItem;
    },

    createNavFilter: function () {
      var links = query('.third-nav-link');
      on(links, 'click', (e) => {
        e.preventDefault();
        links.removeClass('is-active');
        domClass.add(e.currentTarget, '`is-active');

        var val = e.currentTarget.innerHTML;
        if (val === 'All') {
          // show all
        } else {
          var items = query(`[data-goal='${val}']`);
          console.log(items);
        }        
      });
    },

    createModalCountries: function (countryLookups) {
      var container = dom.byId('countryContainer');

      var searchContainer = domConstruct.create('div', {
        class: 'column-20 '
      }, container, 'first');

      var searchBox = domConstruct.create('input', {
        type: 'text',
        placeholder: 'Filter Countries',
        class: 'modifier-class trailer-1 column-10'
      }, searchContainer, 'first');

      on(searchBox, 'input', (e) => {
        var currentText = e.currentTarget.value.toLowerCase();
        if (currentText === '') {
          query('.country-card-modal').removeClass('visually-hidden');
        } else {
          query(`.country-card-modal[data-name*="${currentText}"]`).removeClass('visually-hidden');
          query(`.country-card-modal:not([data-name*="${currentText}"])`).addClass('visually-hidden');
        }
      });

      countryLookups.forEach(country => {
        var countryName = country.name;

        var first = domConstruct.create('div', {
          class: 'block trailer-half cursor country-card-modal',
          'data-name': countryName.toLowerCase()
        }, container, 'last');
        var second = domConstruct.create('div', {
          class: 'card card-bar-blue'
        }, first, 'last');
        var third = domConstruct.create('div', {
          class: 'card-content'
        }, second, 'last');
        
        domConstruct.create('p', {
          class: 'modal-country-name',
          innerHTML: `<a href='#'>${countryName}</a>`
        },
        third,
        'last');

        on(first, 'click', (e) => {
          e.preventDefault();
          calciteWeb.bus.emit('modal:close');
          this.updateActiveCountry(country['alpha-2'].toLowerCase());
        });
      });
    },

    updateActiveCountry: function (countryCode) {
      var uri = window.location.href.substring(window.location.href.indexOf('?') + 1, window.location.href.length);
      var params = null;

      if (window.location.search === '') {
        params = {
          country: countryCode
        };
      } else {
        params = ioQuery.queryToObject(uri);
        params.country = countryCode;
      }

      var queryStr = ioQuery.objectToQuery(params);
      var url = `${window.location.origin}${window.location.pathname}?${queryStr}`;
      console.log(url);

      window.history.pushState(params, null, url);

      var foundItem = this.parseUrlParams(params);
      this.updateHeader(params.country, foundItem.name);

      this.loadCountryProfile(params.country);
    },

    createMap: function () {
      var webmap = new WebMap({
        portalItem: {
          id: '7ba2b4c8d520493e94a546277ad27199'
        }
      });

      var view = new MapView({
        container: 'map',
        map: webmap,
        zoom: 3,
        padding: {
          left: 200
        }
      });

      this.removeMapViewUIComponents(view);
      this.diasbleAllMapInteraction(view);

      this.webmap = webmap;
      this.view = view;
    },

    removeMapViewUIComponents: function (view) {
      view.ui.remove('attribution');
      view.ui.remove('zoom');
    },

    diasbleAllMapInteraction: function (view) {

      view.popup.autoOpenEnabled = false;

      // prevents panning with the mouse drag event
      view.on('drag', function (event) {
        event.stopPropagation();
      });

      // prevent panning by arrow keys
      view.on('key-down', function (event) {
        // prevents panning with the arrow keys
        var keyPressed = event.key;
        if (keyPressed.slice(0, 5) === 'Arrow') {
          event.stopPropagation();
        }
      });

      // prevents mouse wheel zoom
      view.on('mouse-wheel', function (event) {
        event.stopPropagation();
      });

      // Disable the default +/- key-down gestures
      view.on('key-down', function (event) {
        var prohibitedKeys = ['+', '-', 'Shift', '_', '='];
        var keyPressed = event.key;
        if (prohibitedKeys.indexOf(keyPressed) !== -1) {
          event.stopPropagation();
        }
      });

      view.on('click', function (event) {
        event.stopPropagation();
      });

      // prevents double click zoom
      view.on('double-click', function (event) {
        event.stopPropagation();
      });
      view.on('double-click', ['Control'], function (event) {
        event.stopPropagation();
      });

      // Disable pinch zoom and panning
      view.on('drag', function (event) {
        event.stopPropagation();
      });

      // Disable the view's zoom box
      view.on('drag', ['Shift'], function (event) {
        event.stopPropagation();
      });

      view.on('drag', ['Shift', 'Control'], function (event) {
        event.stopPropagation();
      });
    },

    zoomMap: function (x, y) {
      if (this.webmap.loaded) {
        this.view.goTo([x, y], {
          duration: 1000,
          easing: 'ease-in-out'
        });
      } else {
        watchUtils.once(this.view, 'ready', () => {
          this.view.goTo([x, y], {
            duration: 1000,
            easing: 'ease-in-out'
          });
        });
      }
    },

    highlightFeature: function (iso3code) {
      if (this.webmap.loaded) {
        if (!this.mapLayer) {
          this.mapLayer = this.webmap.allLayers.items[1];
        }
        this.mapLayer.definitionExpression = `ISO3CD = '${iso3code}'`;
      } else {
        this.webmap.loadAll()
          .then(() => {
            this.mapLayer = this.webmap.allLayers.items[1];
            this.mapLayer.definitionExpression = `ISO3CD = '${iso3code}'`;
          });
      }
    },

    init: function (base) {

      window.onpopstate = (event) => {
        // console.log(event);
        // window.history.go(-1);
        // window.location = event.target.location;
        var searchString = event.target.location.href.substring(event.target.location.href.indexOf('?') + 1, event.target.location.href.length);
        if (searchString.indexOf('country=') > -1) {
          var splits = searchString.split('=');
          var countryCode = splits[1];

          var params = {country: countryCode};
          var foundItem = this.parseUrlParams(params);
          this.updateHeader(params.country, foundItem.name);
          this.loadCountryProfile(countryCode);
        } else {
          window.location = event.target.location;
        }
      };
      
      on(dom.byId('alert-close'), 'click', () => {
        domClass.remove('share-link-container', 'is-active');
      });

      calciteWeb.init();

      this.createMap();

      countryLookups = JSON.parse(countryLookups);
      sdgsMoreInfo = JSON.parse(sdgsMoreInfo).data;
      sdgsDashboards = JSON.parse(sdgsDashboards);

      this.createModalCountries(countryLookups);
      this.createNavFilter();

      var urlParams = base.results.urlParams;
      var foundItem = this.parseUrlParams(urlParams);
      var countryCode = (urlParams.country) ? urlParams.country : 'unitednations';
      var titleText = (foundItem && foundItem.name) ? foundItem.name : 'SDG Country Profiles';

      this.updateHeader(countryCode, titleText);

      if (countryCode !== 'unitednations') {
        this.loadCountryProfile(countryCode);
      } else {
        this.loadInitialView();
      }

      var path = 'https://services7.arcgis.com/gp50Ao2knMlOM89z/arcgis/rest/services/CountryProfiles/FeatureServer/0/query';
      xhr(path, {
        handleAs: 'json',
        method: 'GET',
        headers: {
          'X-Requested-With': null
        },
        query: {
          f: 'json',
          where: 'Profile_Series = 1',
          outFields: '*'
        }
      })
        .then((response => {
          // console.log(response);
          this.profilesInfo = response;
          // console.log(profilesInfo);

          document.body.classList.remove(this.CSS.loading);
        }));

    },

    loadInitialView: function () {
      var container = dom.byId('fact-container');

      var searchContainer = domConstruct.create('div', {
        class: 'column-20 '
      }, container, 'first');

      var searchBox = domConstruct.create('input', {
        type: 'text',
        placeholder: 'Filter Countries',
        class: 'modifier-class trailer-1 column-10'
      }, searchContainer, 'first');

      on(searchBox, 'input', (e) => {
        var currentText = e.currentTarget.value.toLowerCase();
        if (currentText === '') {
          query('.country-card').removeClass('visually-hidden');
        } else {
          query(`.country-card[data-name*="${currentText}"]`).removeClass('visually-hidden');
          query(`.country-card:not([data-name*="${currentText}"])`).addClass('visually-hidden');
        }
      });

      countryLookups.forEach(country => {
        var countryName = country.name;

        var first = domConstruct.create('div', {
          class: 'column-4 trailer-half cursor country-card',
          'data-name': countryName.toLowerCase(),
        }, container, 'last');
        var second = domConstruct.create('div', {
          class: 'card card-bar-blue',
        }, first, 'last');
        var third = domConstruct.create('div', {
          class: 'card-content'
        }, second, 'last');

        domConstruct.create('p', {
          class: 'modal-country-name',
          innerHTML: `<a href='#'>${countryName}</a>`
        },
        third,
        'last');

        on(first, 'click', (e) => {
          e.preventDefault();
          this.updateActiveCountry(country['alpha-2'].toLowerCase());
        });
      });
    },

    updateHeader: function (countryCode, titleText) {
      this.updateTitleText(titleText);
    },

    updateTitleText: function (titleText) {
      var node = dom.byId('titleNode');
      html.set(node, titleText);
    },

    clearCountryProfile: function () {
      domConstruct.empty('fact-container');
    },

    loadCountryProfile: function (countryCode) {
      this.clearCountryProfile();

      var countryInfo = this.getCountryLookup(countryCode);
      if (countryInfo) {
        var path = `config/country-profiles-new/${countryInfo['country-code']}.json`;
        xhr(path, {
          handleAs: 'json'
        })
          .then((response => {
            // console.log(response);
            if (response.facts && response.facts.length > 0) {
              // append dashboardItemId for each fact
              response.facts.forEach(fact => {                
                var dashboard = null;
                try {
                  dashboard = sdgsDashboards[fact.goalCode];
                  fact.dashboardItemId = dashboard.dashboardItemId;
                } catch (error) {
                  console.log(`error getting dashboard for SDG ${fact.goalCode}, target ${fact.targetCode}, indicator ${fact.indicatorCode}, series ${fact.seriesCode}`);
                }
              });

              this.updateFactSheet(response);
              
              if (response.X && response.Y) {
                var x = parseFloat(response.X);
                var y = parseFloat(response.Y);
                this.zoomMap(x, y);
                this.highlightFeature(response.ISO3CD);
              }

              // look for hash on incoming URL and scroll to it
              ready(() =>{
                if (window.location.hash) {
                  var hash = window.location.hash.replace('#','');
                  var node = dom.byId(hash);
                  node.scrollIntoView();                  
                }
              });
            }
          }));
      }
    },

    groupFactsBySDG: function (facts) {
      var groups = {};
      for (var i = 0; i < facts.length; i++) {
        var fact = facts[i];
        var goalCode = fact.goalCode;
        if (!groups[goalCode]) {
          groups[goalCode] = {
            facts: []
          };
          groups[goalCode]['title'] = fact.goalDesc;
        }
        groups[goalCode].facts.push(fact);

      }
      return groups;
    },

    hideFactSheet: function () {
      domClass.add(dom.byId('fact-container'), 'animate-fade-out');
    },

    showFactSheet: function () {
      domClass.remove(dom.byId('fact-container'), 'animate-fade-out');
      domClass.add(dom.byId('fact-container'), 'animate-fade-in ');
    },

    updateFactSheet: function (response) {
      
      var facts = response.facts;
      var groupedFacts = this.groupFactsBySDG(facts);

      var factContainer = dom.byId('fact-container');
      // for (var i=0; i< groupedFacts.length;i++) {
      for (var fact in groupedFacts) {

        var goal = groupedFacts[fact];
        var moreInfo = this.getMoreSDGInfo(fact);
        var goalTitle = `Goal ${fact}: ${moreInfo.short}`;
        var goalDesc = moreInfo.title;
        var colorInfo = moreInfo.colorInfo;

        var panelCard = domConstruct.create('div', {
          class: 'panel modifier-class trailer-5 panel-override',
          'data-goal': fact
        },
        factContainer,
        'last');

        var goalCard = domConstruct.create('div', {
          class: 'card card-wide column-14 card-override',
        },
        panelCard,
        'last');

        var goalCardIcon = domConstruct.create('figure', {
          class: 'card-wide-image-wrap'
        },
        goalCard,
        'first');

        domConstruct.create('img', {
          class: 'card-wide-image card-image-override',
          src: `https://s3.amazonaws.com/un-country-profiles-2019/SDG_ICONS_2019/E_SDG+goals_icons-individual-rgb-${fact}.png`
        },
        goalCardIcon,
        'first');

        var goalCardContent = domConstruct.create('div', {
          class: 'card-content'
        },
        goalCard,
        'last');

        domConstruct.create('h4', {
          class: 'goal-title',
          innerHTML: goalTitle
        },
        goalCardContent,
        'last');

        domConstruct.create('p', {
          class: 'trailer-half goal-description',
          innerHTML: goalDesc
        },
        goalCardContent,
        'last');

        var subFactsContainer = domConstruct.create('div', {
          class: 'column-21 trailer-1'
        },
        panelCard,
        'last');

        for (var j = 0; j < goal.facts.length; j++) {
          var title = goal.facts[j].fact_text;

          var hardLink = `SDG-${goal.facts[j].goalCode}-TARGET-${goal.facts[j].targetCode}-INDICATOR-${goal.facts[j].indicatorCode}-SERIES-${goal.facts[j].seriesCode}`.replace(/\./g, '-').replace(/_/g, '-');
          domConstruct.create('div', {
            class: 'leader-1 trailer-1 font-size-2 column-17',
            style: `border-left:1px solid ${colorInfo.hex}`,
            innerHTML: `<div class="fact-text-container" id="${hardLink}">${title}</div>`
          }, subFactsContainer, 'last');

          var factMenu = domConstruct.create('div', {
            class: 'leader-1 trailer-2 column-3 text-right',
            style: 'cursor:pointer;'
          }, subFactsContainer, 'last');

          var url = `http://www.sdg.org/datasets/${goal.facts[j].hub}`;
          var downloadIcon = domConstruct.create('div', {
            class: 'icon-ui-download icon-download-override column-1',
            'data-url': url,
            title: 'Download Dataset as CSV'
          }, factMenu, 'last');

          on(downloadIcon, 'click', (e) => {
            window.open(`${e.target.attributes['data-url'].nodeValue}_0.csv`);
          });

          var hardUrl = window.location.origin;
          if (window.location.pathname !== '/') {
            hardUrl = `${hardUrl}${window.location.pathname}${window.location.search}#${hardLink}`;
          } else {
            hardUrl = `${hardUrl}/${window.location.search}#${hardLink}`;
          }       
          var shareIcon = domConstruct.create('div', { 
            class: 'icon-share-override column-1 text-left',
            title: 'Share Link to Fact',
            innerHTML: '<img src="https://s3.amazonaws.com/un-country-profiles-2019/share-icon.png" />',
            'data-url': hardUrl
          }, factMenu, 'last');

          on(shareIcon, 'click', (e) => {
            var sectionLink = e.currentTarget.attributes['data-url'].nodeValue;

            // copy to clipboard
            var input = domConstruct.create('input', { value: sectionLink }, document.body, 'last');
            input.select();
            document.execCommand('copy');
            domConstruct.destroy(input);

            var shareLink = dom.byId('share-link');
            domAttr.set(shareLink, 'href', sectionLink);
            var alertNode = dom.byId('share-link-container');

            var coords = domGeometry.docScroll();
            var newTop = coords.y+5;
            domStyle.set(alertNode, 'top', `${newTop}px`);

            domClass.add(alertNode, 'is-active');

            // // var loc = window.location;
            // var path = 'https://arcg.is/prod/shorten';
            // xhr(path, {
            //   handleAs: 'json',
            //   method: 'POST',
            //   headers: {
            //     'X-Requested-With': null
            //     // ,':authority:': 'arcgi.is'
            //   },
            //   query: {
            //     longUrl: sectionLink,
            //     f: 'json'
            //   }
            // })
            //   .then((response => {
            //     if (response && response.data) {
            //       var shortenedUrl = response.data.long_url;
            //       console.log(shortenedUrl);
            //     }
            //   }))
            //   .catch(error => {
            //     console.log(error);
            //   });
      
          });

          // if there are data values AND they are numeric (not something like '> 95 percent')
          if (goal.facts[j].data_values.length &&
            !isNaN(parseInt(goal.facts[j].data_values[0]))) {
           
            var chartId = `chart-card-goal${fact}-${j}`;
            
            var cardGroupNode = this.createCardGroupContainer(chartId, colorInfo.hex, goal.facts[j].hub, goal.facts[j].dashboardItemId, response.ISO3CD);
            domConstruct.place(cardGroupNode, subFactsContainer, 'last');

            var chartSpec = this.createLineChartCardSpec(goal.facts[j].data_values, goal.facts[j].data_years, goal.facts[j].fact_years, colorInfo.hex);

            this.createChartCard(chartId, chartSpec);

            // this.createDashboardCard(cardGroupContainer, '');

            // if (goal.facts[j].hub) {
            //   var mapId = `map-card-goal-${fact}-${j}`;
            //   var responseInfo = {
            //     lat: response.Y,
            //     lng: response.X,
            //     iso3cd: response.ISO3CD,
            //     sliceDimensions: goal.facts[j].slice_dimensions,
            //     hubItemId: goal.facts[j].hub
            //   }
            //   this.createMapCard(cardGroupContainer, mapId, colorInfo.hex, responseInfo);
            // }

          } else {
            // add a separator for now

            // border-bottom: 1px solid {color};
            // padding-bottom: 30px;
          }
        }

      }
    },

    createCardGroupContainer: function (chartId, colorHex, hubItemId, dashboardItemId) {
      var html = `
        <div class='column-21 trailer-1'>
            <div class='column-17'>              
                <div class='card card-bar-blue block' style='border-top: 3px solid ${colorHex}'>
                    <div class='card-content'>
                        <div class='chart-card' id='card-attach-${chartId}'></div>
                    </div>
                </div>
            </div>
            <div class='column-3'>
              <a href='http://undesa.maps.arcgis.com/apps/opsdashboard/index.html#/${dashboardItemId}' target='_blank'>
                <div class='card card-bar-blue block trailer-1 icon-link-card' style='border-top: 3px solid ${colorHex};'>
                  <div class='card-content center-column'>
                    <img class='dashboard-icon' src='https://s3.amazonaws.com/un-country-profiles-2019/dashboard16.svg'/> 
                    <span class='font-size--3'>View Dashboard</span>
                  </div>
                </div>
              </a>
              <a href='http://www.sdg.org/datasets/${hubItemId}_0' target='_blank'>
                <div class='card card-bar-blue block icon-link-card' style='border-top: 3px solid ${colorHex};'>
                  <div class='card-content center-column'>
                    <img class='hub-icon' src='https://s3.amazonaws.com/un-country-profiles-2019/globe.svg' /> 
                    <span class='font-size--3'>View Dataset</span>
                  </div>
                </div>
              </a>
            </div>
          </div>
        `;

      return domConstruct.toDom(html);
    },

    createChartCardSpec: function (values, years, fact_years, color) {
      var chartFeatures = [];
      values.forEach((val, i) => {
        var year = years[i];
        var isFactYear = false;
        if (fact_years.indexOf(year) > -1) {
          isFactYear = true;
        }
        chartFeatures.push({
          attributes: {
            dataValue: val,
            dataYear: year,
            color: color,
            lineColor: color,
            alphaColor: (isFactYear) ? 1 : 0
          }
        });
      });

      chartFeatures.sort(function (a, b) {
        return parseInt(a.attributes.dataYear) - parseInt(b.attributes.dataYear);
      });

      return {
        type: 'bar',
        datasets: [{
          data: chartFeatures
        }],
        style: {
          colors: [color]
        },
        series: [{
          category: {
            field: 'dataYear'
          },
          value: {
            field: 'dataValue'
          }
        }]
      };
    },

    createLineChartCardSpec: function (values, dataYears, factYears, color) {
      var chartFeatures = [];
      values.forEach((val, i) => {
        var year = dataYears[i];
        var isFactYear = false;
        if (factYears.indexOf(year) > -1) {
          isFactYear = true;
        }
        chartFeatures.push({
          attributes: {
            dataValue: val,
            dataYear: year,
            color: color,
            lineColor: color,
            alphaColor: (isFactYear) ? 1 : .60,
            bulletSize: (isFactYear) ? 10 : 6
          }
        });
      });

      chartFeatures.sort(function (a, b) {
        return parseInt(a.attributes.dataYear) - parseInt(b.attributes.dataYear);
      });

      return {
        type: 'line',
        datasets: [{
          data: chartFeatures
        }],
        style: {
          colors: [color]
        },
        series: [{
          category: {
            field: 'dataYear'
          },
          value: {
            field: 'dataValue'
          }
        }]
      };
    },

    createChartCard: function (chartId, chartSpec) {
      // var cardTopStyle = `border-top: 3px solid ${chartSpec.style.colors[0]}`;
      // var innerHTML = `<div class='card card-bar-blue block' style='${cardTopStyle}'> <div class='card-content'> <div class='chart-card' id='card-attach-${chartId}'></div> </div> </div>`;

      // var chartCard = domConstruct.toDom(innerHTML);

      // domConstruct.place(chartCard, cardGroupContainer, 'last');

      var chart = new cedar.Chart(`card-attach-${chartId}`, chartSpec);
      chart.overrides({
        // balloon: {enabled:false}
        graphs: [{
          balloonText: '<strong>[[dataValue]]</strong><br />[[dataYear]]',
          colorField: 'color',
          lineColorField: 'lineColor',
          alphaField: 'alphaColor',
          bulletSizeField: 'bulletSize',
          lineAlpha: 0.60,
          dashLength: 6
        }]
      });

      chart.show();
    },

    createMapCard: function (cardGroupContainer, mapId, topColor, responseInfo) {
      var mapCardTopStyle = `border-top: 3px solid ${topColor}`;
      var newMapId = `card-attach-${mapId}`;
      var newMapIdImg = `${newMapId}-img`;
      var loaderId = `${newMapId}-loader`;
      var innerHTML = `<div class='card card-bar-blue block' style='${mapCardTopStyle}'> <div class='card-content map-card-content'> <div class='ph-item' id='${loaderId}'> <div class='ph-col-4 pre-3'> <div class='ph-avatar'></div></div></div> <img id='${newMapIdImg}' class='map-image' src=''/><div class='map-card' id='${newMapId}'></div> </div> </div>`;
      // testing w/o the loading div
      // var innerHTML = `<div class='card card-bar-blue block' style='${mapCardTopStyle}'> <div class='card-content map-card-content'>  <img id='${newMapIdImg}' src=''/><div class='map-card' id='${newMapId}'></div> </div> </div>`;
      var mapCard = domConstruct.toDom(innerHTML);
      domConstruct.place(mapCard, cardGroupContainer, 'last');

      var mapOptions = {
        newMapId: newMapId,
        newMapIdImg: newMapIdImg,
        loaderId: loaderId,
        responseInfo: responseInfo,
        goalColor: topColor
      };

      this.createMapObserver(mapOptions);
    },

    createMapObserver: function (mapOptions) {
      var observer;

      var options = {
        root: null,
        rootMargin: '0px',
        threshold: [0.5]
      };

      observer = new IntersectionObserver((entries) => {
        // console.log(entries);
        console.log('observing ..');
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // console.log(entry.intersectionRatio);
            // remove observer and create map
            observer.unobserve(dom.byId(mapOptions.newMapId));
            this.initMapCard(mapOptions);
          }
        });
      }, options);

      observer.observe(dom.byId(mapOptions.newMapId));
    },

    initMapCard: function (mapOptions) {
      var unbasemap = new VectorTileLayer({
        url: 'http://undesa.maps.arcgis.com/sharing/rest/content/items/1b93d39e30e944479101cdec2351dca0/resources/styles/root.json'
      });
      var basemap = new Basemap({
        baseLayers: [unbasemap]
      });

      var map = new Map({
        basemap: basemap
      });

      var view = new MapView({
        container: mapOptions.newMapId,
        map: map,
        zoom: 3,
        center: [mapOptions.responseInfo.lng, mapOptions.responseInfo.lat]
      });

      var highlightGraphic = new Graphic({
        geometry: view.center,
        symbol: {
          type: 'simple-marker',
          style: 'diamond',
          color: [255, 255, 255, 0],
          size: '20px',
          outline: {
            width: 1.4,
            // color: mapOptions.goalColor,
            color: 'yellow',
            style: 'dash'
          }
        }
      });

      var graphicsLayer = new GraphicsLayer({
        graphics: [highlightGraphic]
      });

      this.diasbleAllMapInteraction(view);
      this.removeMapViewUIComponents(view);

      Layer.fromPortalItem({
        portalItem: {
          id: mapOptions.responseInfo.hubItemId
        }
      })
        .then(function (layer) {
          map.addMany([unbasemap, graphicsLayer, layer]);

          // TODO :: find a way to trap errors that occur when layers don't load.
          // WHY DOESN'T THIS FIRE WHEN THE LAYER ERRROS??
          layer.watch('loadError', () => {
            console.log('error loading the layer!', layer);
          });

          view.whenLayerView(layer)
            .then(lyrView => {
              var watchHandle = watchUtils.watch(lyrView, 'updating', () => {

                // var query = lyrView.layer.createQuery();
                // query.where = `ISO3CD ='${mapOptions.responseInfo.iso3cd}'`;
                // console.log(query.where);

                // lyrView.layer.queryFeatures(query).then(result => {
                //   console.log(result);
                // });

                watchHandle.remove();

                // take screenshot and dispose of map
                var options = {
                  width: 476,
                  height: 232,
                  quality: 100,
                  format: 'png'
                };

                view.takeScreenshot(options).then(function (screenshot) {
                  var imageElement = document.getElementById(mapOptions.newMapIdImg);
                  imageElement.src = screenshot.dataUrl;
                  on(imageElement, 'click', () => {
                    window.open(`http://www.sdg.org/datasets/${mapOptions.responseInfo.hubItemId}_0`);
                  });

                  domConstruct.destroy(mapOptions.newMapId);
                  var anOut = fx.fadeOut({
                    node: mapOptions.loaderId
                  });
                  var anIn = fx.fadeIn({
                    node: mapOptions.newMapIdImg
                  });

                  var comb = coreFx.combine([anOut, anIn]);
                  connect.connect(comb, 'onEnd', () => {
                    domConstruct.destroy(mapOptions.loaderId);
                    delete unbasemap;
                    delete graphicsLayer;
                    delete layer;
                    delete view;
                    delete map;
                  });
                  comb.play();
                });
              });
            })
            .catch(error => {
              console.log(`error loading layerview for :: ${layer.title} \n ${error}`);
            });
        })
        .catch(error => {
          console.log(`error loading portal item :: ${mapOptions.responseInfo.hubItemId} \n ${error}`);
        });

    }

  });

});