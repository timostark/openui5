/*!
 * ${copyright}
 */

//Provides class sap.ui.model.odata.v4.lib.Requestor
sap.ui.define(["jquery.sap.global", "./_Helper"], function (jQuery, Helper) {
	"use strict";

	var mFinalHeaders = { // final (cannot be overridden) request headers for OData v4
			"Content-Type" : "application/json;charset=UTF-8"
		},
		mPredefinedHeaders = { // predefined request headers for OData v4
			"Accept" : "application/json;odata.metadata=minimal",
			"OData-MaxVersion" : "4.0",
			"OData-Version" : "4.0",
			"X-CSRF-Token" : "Fetch"
		};

	/**
	 * Constructor for a new <code>_Requestor<code> instance for the given service URL and default
	 * headers.
	 *
	 * @param {string} sServiceUrl
	 *   URL of the service document to request the CSRF token from; also used to resolve
	 *   relative resource paths (see {@link #request})
	 * @param {object} mHeaders
	 *   Map of default headers; may be overridden with request-specific headers; certain
	 *   predefined OData v4 headers are added by default, but may be overridden
	 * @param {object} mQueryParams
	 *   A map of query parameters as described in {@link _Header.buildQuery}; used only to
	 *   request the CSRF token
	 * @private
	 */
	function Requestor(sServiceUrl, mHeaders, mQueryParams) {
		this.sServiceUrl = sServiceUrl;
		this.mHeaders = mHeaders || {};
		this.sQueryParams = Helper.buildQuery(mQueryParams); // CSRF token only!
		this.oSecurityTokenPromise = null; // be nice to Chrome v8
	}

	/**
	 * Returns this requestor's service URL.
	 *
	 * @returns {string}
	 *   URL of the service document to request the CSRF token from
	 */
	Requestor.prototype.getServiceUrl = function () {
		return this.sServiceUrl;
	};

	/**
	 * Returns a promise that will be resolved once the CSRF token has been refreshed, or rejected
	 * if that fails. Makes sure that only one HEAD request is underway at any given time and
	 * shares the promise accordingly.
	 *
	 * @returns {Promise}
	 *   A promise that will be resolved (with no result) once the CSRF token has been refreshed.
	 *
	 * @private
	 */
	Requestor.prototype.refreshSecurityToken = function () {
		var that = this;

		if (!this.oSecurityTokenPromise) {
			this.oSecurityTokenPromise = new Promise(function (fnResolve, fnReject) {
				jQuery.ajax(that.sServiceUrl + that.sQueryParams, {
					method : "HEAD",
					headers : {
						"X-CSRF-Token" : "Fetch"
					}
				}).then(function (oData, sTextStatus, jqXHR) {
					that.mHeaders["X-CSRF-Token"] = jqXHR.getResponseHeader("X-CSRF-Token");
					that.oSecurityTokenPromise = null;
					fnResolve();
				}, function (jqXHR, sTextStatus, sErrorMessage) {
					that.oSecurityTokenPromise = null;
					fnReject(Helper.createError(jqXHR));
				});
			});
		}

		return this.oSecurityTokenPromise;
	};

	/**
	 * Sends an HTTP request using the given method to the given relative URL, using the given
	 * request-specific headers in addition to the mandatory OData v4 headers and the default
	 * headers given to the factory. Takes care of CSRF token handling.
	 *
	 * @param {string} sMethod
	 *   HTTP method, e.g. "GET"
	 * @param {string} sResourcePath
	 *   A resource path relative to the service URL for which this requestor has been created
	 * @param {object} [mHeaders]
	 *   Map of request-specific headers, overriding both the mandatory OData v4 headers and the
	 *   default headers given to the factory. This map of headers must not contain
	 *   "X-CSRF-Token" header.
	 * @param {object} [oPayload]
	 *   Data to be sent to the server
	 * @param {boolean} [bIsFreshToken=false]
	 *   Whether the CSRF token has already been refreshed and thus should not be refreshed
	 *   again
	 * @returns {Promise}
	 *   A promise on the outcome of the HTTP request
	 * @private
	 */
	Requestor.prototype.request = function (sMethod, sResourcePath, mHeaders, oPayload,
		bIsFreshToken) {
		var that = this;

		return new Promise(function (fnResolve, fnReject) {
			jQuery.ajax(that.sServiceUrl + sResourcePath, {
				data : JSON.stringify(oPayload),
				headers : jQuery.extend({},
					mPredefinedHeaders, that.mHeaders, mHeaders, mFinalHeaders),
				method : sMethod
			}).then(function (oPayload, sTextStatus, jqXHR) {
				that.mHeaders["X-CSRF-Token"]
					= jqXHR.getResponseHeader("X-CSRF-Token") || that.mHeaders["X-CSRF-Token"];
				fnResolve(oPayload);
			}, function (jqXHR, sTextStatus, sErrorMessage) {
				var sCsrfToken = jqXHR.getResponseHeader("X-CSRF-Token");
				if (!bIsFreshToken && jqXHR.status === 403
						&& sCsrfToken && sCsrfToken.toLowerCase() === "required") {
					// refresh CSRF token and repeat original request
					that.refreshSecurityToken().then(function () {
						fnResolve(that.request(sMethod, sResourcePath, mHeaders, oPayload, true));
					}, fnReject);
				} else {
					fnReject(Helper.createError(jqXHR));
				}
			});
		});
	};

	/**
	 * The <code>_Requestor<code> module which offers a factory method.
	 *
	 * @private
	 */
	return {
		/**
		 * Creates a new <code>_Requestor<code> instance for the given service URL and default
		 * headers.
		 *
		 * @param {string} sServiceUrl
		 *   URL of the service document to request the CSRF token from; also used to resolve
		 *   relative resource paths (see {@link #request})
		 * @param {object} mHeaders
		 *   Map of default headers; may be overridden with request-specific headers; certain
		 *   OData v4 headers are predefined, but may be overridden by the default or
		 *   request-specific headers:
		 *   <pre>{
		 *     "Accept" : "application/json;odata.metadata=minimal",
		 *     "OData-MaxVersion" : "4.0",
		 *     "OData-Version" : "4.0"
		 *   }</pre>
		 *   The map of the default headers must not contain "X-CSRF-Token" header. The created
		 *   <code>_Requestor<code> always sets the "Content-Type" header to
		 *   "application/json;charset=UTF-8" value.
		 * @param {object} mQueryParams
		 *   A map of query parameters as described in {@link _Header.buildQuery}; used only to
		 *   request the CSRF token
		 * @returns {object}
		 *   A new <code>_Requestor<code> instance
		 */
		create : function (sServiceUrl, mHeaders, mQueryParams) {
			return new Requestor(sServiceUrl, mHeaders, mQueryParams);
		}
	};
}, /* bExport= */false);
