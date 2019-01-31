/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");

  you may not use this file except in compliance with the License.

  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software

  distributed under the License is distributed on an "AS IS" BASIS,

  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and

  limitations under the License.​
*/

define([
  'dojo/_base/declare',
  'dojo/dom',
  'dojo/dom-class',
  'dojo/dom-construct',
  'dojo/html',
  'dojo/hash',
  'dojo/on',
  'dojo/query',
  'dojo/io-query',
  'dojo/dom-attr',
  'dojo/request/xhr',
  'ApplicationBase/ApplicationBase',
  'dojo/i18n!./nls/resources',
  // 'node_modules/calcite-web/dist/js/calcite-web.js',
  'calcite-web',
  'dojo/text!/config/country-lookups.json',
  'dojo/text!/config/sdgs-more-info.json',

  '@esri/arcgis-rest-request',
  '@esri/arcgis-rest-feature-service',
  '@esri/cedar',

  'esri/Map',
  'esri/views/MapView',
  'esri/WebMap',
  'esri/core/watchUtils'
], function (
  declare,
  dom,
  domClass,
  domConstruct,
  html,
  hash,
  on,
  query,
  ioQuery,
  domAttr,
  xhr,
  ApplicationBase,
  i18n,
  calciteWeb,
  countryLookups,
  sdgsMoreInfo,

  agrr,
  agfs,
  cedar,

  Map,
  MapView,
  WebMap,
  watchUtils
) {
    return declare(null, {

      currentFlagClass: 'unitednations',

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
            var items = query(`[data-goal="${val}"]`);
          }
          
          console.log(items);
        });
      },

      createModalCountries: function (countryLookups) {
        var container = dom.byId('countryContainer');
        countryLookups.forEach(country => {
          var first = domConstruct.create('div', { class: 'block trailer-half cursor' }, container, 'last');
          var second = domConstruct.create('div', { class: 'card card-bar-blue' }, first, 'last');
          var third = domConstruct.create('div', { class: 'card-content' }, second, 'last');

          var countryName = country.name;
          var flagInner = domConstruct.create('span', 
            {
              class: `flag flag-icon flag-icon-${country['alpha-2'].toLowerCase()} flag-override`
            },
            third, 
            'last');
          var inner = domConstruct.create('p', {
              class: 'modal-country-name',
              innerHTML: `<a href="#">${countryName}</a>`
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
        var uri = window.location.href.substring(window.location.href.indexOf("?") + 1, window.location.href.length);
        var params = null; 

        if (window.location.search === '') {
          params = { country: countryCode };
        } else {
          params = ioQuery.queryToObject(uri);
          params.country = countryCode;
        }

        var queryStr = ioQuery.objectToQuery(params);
        var url = `${window.location.origin}${window.location.pathname}?${queryStr}`;
        console.log(url);

        window.history.pushState(params, '', url);
        
        var foundItem = this.parseUrlParams(params);
        this.updateHeader(params.country, foundItem.name);

        this.loadCountryProfile(params.country);
      },

      createMap: function () {
        // var map = new Map({
        //   basemap: 'streets'
        // });

        var webmap = new WebMap({ 
          portalItem: {
            id: '7ba2b4c8d520493e94a546277ad27199' }
          }
        );

        var view = new MapView({
          container: 'map',
          map: webmap,  
          zoom: 4,
          padding: {
            left: 200
          }
        });

        // webmap.when('loaded', () => {
        //   this.mapLayer = webmap.allLayers.items[0];
        // });

        view.ui.remove('attribution');
        view.ui.remove('zoom');

        this.webmap = webmap;
        this.view = view;
      },

      zoomMap: function (x,y) {
        if (this.webmap.loaded) {
          this.view.goTo([ x, y], { duration: 1000, easing: 'ease-in-out'});
        } else {
          watchUtils.once(this.view, 'ready', () => {
            this.view.goTo([ x, y], { duration: 1000, easing: 'ease-in-out'});
          });
        }
      },

      highlightFeature: function (iso3code) {
        if (this.webmap.loaded) {
          this.mapLayer.definitionExpression = `ISO3CD = '${iso3code}'`;
        } else {
          this.webmap.loadAll()
            .then(()=> {
              this.mapLayer = this.webmap.allLayers.items[1];
              this.mapLayer.definitionExpression = `ISO3CD = '${iso3code}'`;
            });
        }
      },

      init: function (base) {
        calciteWeb.init();

        this.createMap();
        
        countryLookups = JSON.parse(countryLookups);
        sdgsMoreInfo = JSON.parse(sdgsMoreInfo).data;

        this.createModalCountries(countryLookups);
        this.createNavFilter();

        var urlParams = base.results.urlParams;
        var foundItem = this.parseUrlParams(urlParams);
        var countryCode = (urlParams.country) ? urlParams.country : 'unitednations';
        var titleText = (foundItem && foundItem.name) ? foundItem.name : 'SDG Country Profiles';

        this.updateHeader(countryCode, titleText)

        if (countryCode !== 'unitednations') {
          this.loadCountryProfile(countryCode);
        }

        document.body.classList.remove(this.CSS.loading);
      },

      updateHeader: function (countryCode, titleText, subTitleText) {
        // this.updateFlagIcon(countryCode.toLowerCase());
        this.updateTitleText(titleText);
      },

      updateFlagIcon: function (countryCode) {
        var node = dom.byId('flagNode');

        domClass.remove(node, this.currentFlagClass);
        
        var flagClass = `flag-icon-${countryCode}`;
        domClass.add(node, flagClass);

        this.currentFlagClass = flagClass;
      },

      updateTitleText: function (titleText) {
        var node = dom.byId('titleNode');
        html.set(node, titleText);
      },

      clearCountryProfile: function () {
        domConstruct.empty('fact-container');
      },

      loadCountryProfile: function (countryCode) {
        this.hideFactSheet();
        
        this.clearCountryProfile();

        var countryInfo = this.getCountryLookup(countryCode);
        if (countryInfo) {
          var path = `config/country-profiles-new/${countryInfo['country-code']}.json`;
          xhr(path, { handleAs: 'json' })
            .then((response => {
              // console.log(response);
              if (response.facts && response.facts.length > 0) {
                this.updateFactSheet(response);
                this.showFactSheet();
                if (response.X && response.Y) {
                  var x = parseFloat(response.X);
                  var y = parseFloat(response.Y);
                  this.zoomMap(x, y);
                  this.highlightFeature(response.ISO3CD);
                }
              }
            }))
        }        
      },

      groupFactsBySDG: function (facts) {
        var groups = {};
        for (var i=0;i < facts.length;i++) {
          var fact = facts[i];
          var goalCode = fact.goalCode;
          if (!groups[goalCode]) {
            groups[goalCode] = { facts: [] };
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
        for (fact in groupedFacts) {
          
          var goal = groupedFacts[fact];
          var moreInfo = this.getMoreSDGInfo(fact);
          var goalTitle = `Goal ${fact}: ${moreInfo.short}`;
          var goalDesc = moreInfo.title;
          var colorInfo = moreInfo.colorInfo;
          
          var panelCard = domConstruct.create('div', 
            {
              class: 'panel modifier-class trailer-5 panel-override',
              'data-goal': fact
            },
            factContainer, 
            'last');

          var goalCard = domConstruct.create('div', 
            { 
              class: 'card card-wide column-14 card-override',
            }, 
            panelCard, 
            'last');

          var goalCardIcon = domConstruct.create('figure', 
            {
              class: 'card-wide-image-wrap',
              style: `background-color: ${colorInfo.hex}`
            },
            goalCard,
            'first');

          var goalCardIconImg = domConstruct.create('img', 
            {
              class: 'card-wide-image card-image-override',
              src: `/assets/images/sdg-icons/en/TGG_Icon_Only_Color_${fact}.gif`
            },
            goalCardIcon,
            'first');

          var goalCardContent = domConstruct.create('div',
            {
              class: 'card-content'
            },
            goalCard,
            'last');
          
          var goalHeader = domConstruct.create('h4', 
            {
              class: 'trailer-half',
              innerHTML: goalTitle
            },
            goalCardContent,
            'last');

          var goalDescContent = domConstruct.create('p', 
            {
              class: 'font-size--1 trailer-half',
              innerHTML: goalDesc
            },
            goalCardContent,
            'last');
          
          var subFactsContainer = domConstruct.create('div', 
            { 
              class: 'column-18' 
            }, 
            panelCard,
            'last');

          var ol = domConstruct.create('ol', 
            { 
              class: 'list-numbered font-size-1' 
            }, 
            subFactsContainer,
            'last');

          for (var j=0; j < goal.facts.length;j++) {
            var title = goal.facts[j].fact_text;
            var factLi = domConstruct.create('li', { innerHTML: title }, ol, 'last');

            if (goal.facts[j].data_values.length > 1) {
              var chartId = `chart-card-goal${fact}-${j}`;
              var chartContainer = domConstruct.create('div', { id: chartId, class: 'chart-card'}, ol, 'last');
              var chartDef = this.createChartCardSpec(goal.facts[j].data_values, goal.facts[j].data_years, goal.facts[j].fact_years, colorInfo.hex);
              var chart = new cedar.Chart(chartId, chartDef);
              chart.overrides({
                // balloon: {enabled:false}
                graphs: [{
                  balloonText: '<strong>[[dataValue]]</strong><br />[[dataYear]]',
                  colorField: 'color',
                  lineColorField: 'lineColor',
                  alphaField: 'alphaColor',
                  lineAlpha: 0.35
                }]
              });

              chart.show();
            }
            

          }          
        }
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

        chartFeatures.sort(function(a, b) {
          return parseInt(a.attributes.dataYear) - parseInt(b.attributes.dataYear);
        });

        return {
          type: 'bar',
          datasets: [ { data: chartFeatures } ],
          style: {
            colors: [color]
          },
          series: [
            {
              category: { field: 'dataYear' },
              value: { field: 'dataValue' }
            }
          ]
        };
      },

      createMapCard: function () {

      }

    });

  });
