const querystring = require('querystring');
const qs = require('qs');
const axios = require("axios");
const appConfig = require('config');
const jwt = require('jsonwebtoken');
const htmlEntities = require('html-entities');
const _ = require('lodash');
const ROOT_URL = appConfig.get('root_url');
const { v4: uuidv4 } = require('uuid');
const redis = require("redis");
const auth_server_url = appConfig.get('auth-server-url');
const realm_name = appConfig.get('realm');
const client_id = appConfig.get('client_id');
const client_secret = appConfig.get('client_secret');
const page_title = appConfig.get('page_title');

const HomeURL = `${ROOT_URL}/login`;

const getRedisClient = async () => {
	return await redis.createClient({ url: process.env.REDIS_URL })
  .on('error', err => console.log('Redis Client Error', err))
  .connect();
}

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
			error_message: req.query.error,
			error_description: htmlEntities.encode(error_description),
			debug: debug,
			debug_info: debug_info
		});

	});

	app.get('/authentication', async (req, res) => {
		const nonce = uuidv4();
		const redisClient = await getRedisClient();
		const state = req.query.state;
		const debug = req.query.debug;
		const phone = req.query.phone;

		const redirectClientURL = `${ROOT_URL}/ipification/${debug}/callback`;
		const scope = 'openid ip:phone_verify';

		const request = await jwt.sign({
			login_hint: phone,
			client_id: client_id,
			state: state,
			response_type: 'code',
			redirect_uri: redirectClientURL,
			scope: scope
		}, client_secret, {algorithm: 'HS256'})

		let params = {
			response_type: 'code',
			scope: scope,
			client_id: client_id,
			redirect_uri: redirectClientURL,
			state: state,
			nonce: `${nonce}:${phone}`,
			request: request
		};
		await redisClient.set(`${state}_phone`, phone, 'EX', 5);
		let authUrl = `${auth_server_url}/realms/${realm_name}/protocol/openid-connect/auth?` + querystring.stringify(params);
		console.log("---> auth url: ", authUrl)
		res.redirect(authUrl);

	})

	// 381692023534

	app.get('/ipification/:debug/callback', async function(req, res){
		const redisClient = await getRedisClient();
		const state = req.query.state;
		const debug = req.params.debug;

		console.log('---> debug: ', debug);

		const redirectClientURL = `${ROOT_URL}/ipification/${debug}/callback`;

		let tokenEndpointURL = auth_server_url + '/realms/' + realm_name + '/protocol/openid-connect/token';

		if(req.query.error){
			console.log('---> kc error: ', req.query.error)
			const phone_number = await redisClient.get(`${state}_phone`);
			res.redirect(`${HomeURL}?state=${state}&phone_number=${phone_number}&error_description=${req.query.error}&error=invalid phone number`);
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
			const {phone_number_verified, nonce} = token_info;
			const nonce_info = nonce.split(':');
			const phone_number = nonce_info[1];

			console.log('---> id_token info: ', id_token);
			console.log('---> token info: ', token_info);

			const debug_info = JSON.stringify({
				phone_number_verified: phone_number_verified,
			});

			if(phone_number_verified === 'false'){
				const params = {
					state: state,
					phone_number: phone_number,
					error: 'invalid phone number'
				}

				if(debug == 1) params.debug_info = debug_info;

				const url = HomeURL + '?' + querystring.stringify(params);
				res.redirect(url);
				return;
			}

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
			const phone_number = await redisClient.get(`${state}_phone`);
			res.redirect(`${HomeURL}?phone_number=${phone_number}&error_description=${err.message}`);
		}


	})


	app.get('*', function(req, res) {
		res.redirect(`${ROOT_URL}/login`);
	});

};
