const querystring = require('querystring');
const qs = require('qs');
const axios = require("axios");
const appConfig = require('config');
const jwt = require('jsonwebtoken');
const htmlEntities = require('html-entities');
const _ = require('lodash');
const ROOT_URL = appConfig.get('root_url');
const { v4: uuidv4 } = require('uuid');

const auth_server_url = appConfig.get('auth-server-url');
const realm_name = appConfig.get('realm');
const client_id = appConfig.get('client_id');
const client_secret = appConfig.get('client_secret');
const page_title = appConfig.get('page_title');

const HomeURL = `${ROOT_URL}/login`;

module.exports = function(app) {

	app.get('/', function(req, res){
		res.redirect(HomeURL);
	})

	// main login page //
	app.get('/login', async (req, res) => {
		
		const error_description = req.query.error_description;
		const state = req.query.state || uuidv4();
		const debug = req.query.debug || 0;
		const debug_info = req.query.debug_info;
		
		res.render('login', {
			ROOT_URL: ROOT_URL,
			page_title: page_title,
			state: state,
			phone_number: req.query.phone_number,
			error_description: htmlEntities.encode(error_description),
			debug: debug,
			debug_info: debug_info
		});
		
	});

	app.get('/authentication', (req, res) => {
		const nonce = uuidv4();
		const state = req.query.state;
		const debug = req.query.debug;

		const redirectClientURL = `${ROOT_URL}/ipification/${debug}/callback`;
		const scope = 'openid ip:phone';

		let params = {
			response_type: 'code',
			scope: scope,
			client_id: client_id,
			redirect_uri: redirectClientURL,
			state: state,
			nonce: nonce,
			channel: 'wa viber telegram'
		};
		let authUrl = `${auth_server_url}/realms/${realm_name}/protocol/openid-connect/auth?` + querystring.stringify(params);
		console.log("---> auth url: ", authUrl)
		res.redirect(authUrl);

	})

	app.get('/ipification/:debug/callback', async function(req, res){
		const state = req.query.state;
		const debug = req.params.debug;

		console.log('---> debug: ', debug);

		const redirectClientURL = `${ROOT_URL}/ipification/${debug}/callback`;

		let tokenEndpointURL = auth_server_url + '/realms/' + realm_name + '/protocol/openid-connect/token';

		if(req.query.error){
			console.log('---> kc error: ', req.query.error)
			res.redirect(`${HomeURL}?state=${state}&error_description=${req.query.error}`);
			return;
		}

		let requestBody = {
			code: req.query.code,
			redirect_uri: redirectClientURL,
			grant_type: 'authorization_code',
			client_id: client_id,
			client_secret: client_secret
		};

		const config = {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}

		try {
			const tokenResponse = await axios.post(tokenEndpointURL, qs.stringify(requestBody), config)
			
			const { id_token } = tokenResponse.data;
			const token_encode = id_token.split('.')[1];
			const ascii = Buffer.from(token_encode, 'base64').toString('ascii');
			const token_info = JSON.parse(ascii);
			const {phone_number_verified, phone_number } = token_info;

			console.log('---> id_token info: ', id_token);
			console.log('---> token info: ', token_info);

			const debug_info = JSON.stringify({
				phone_number_verified: phone_number_verified,
			});

			const response = {
				ROOT_URL: ROOT_URL,
				page_title: page_title,
				home_url: HomeURL,
				phone_number: phone_number,
				state: state
			}

			if(debug == 1) response.debug_info = debug_info;

			res.render('result', response)

		} catch (err) {
			console.log('---> get token error: ', err.message);
			res.redirect(`${HomeURL}?error_description=${err.message}`);
		}

		
	})
	// app.get('*', function(req, res) { 
	// 	res.redirect(`${ROOT_URL}/login`);
	// });

};
