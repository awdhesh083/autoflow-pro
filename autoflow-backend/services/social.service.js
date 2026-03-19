'use strict';
const { TwitterApi }  = require('twitter-api-v2');
const { IgApiClient } = require('instagram-private-api');
const axios           = require('axios');
const logger          = require('../utils/logger');
const { Account }     = require('../models');

const SocialService = {
  async post(platform, accountId, { text, media = [] }) {
    const account = await Account.findById(accountId).select('+credentials');
    if (!account) throw new Error('Account not found');
    switch (platform) {
      case 'twitter':   return this._tweet(account, text, media);
      case 'instagram': return this._instagramPost(account, text, media);
      case 'facebook':  return this._facebookPost(account, text, media);
      case 'linkedin':  return this._linkedinPost(account, text, media);
      default:          throw new Error(`Platform ${platform} not supported by SocialService`);
    }
  },

  async _tweet(account, text, media) {
    const client = new TwitterApi({
      appKey:       account.credentials.appId,
      appSecret:    account.credentials.appSecret,
      accessToken:  account.credentials.accessToken,
      accessSecret: account.credentials.apiKey,
    });
    const tweet = await client.v2.tweet(text.substring(0, 280));
    return { platform: 'twitter', id: tweet.data.id, text: tweet.data.text };
  },

  async _instagramPost(account, caption, media) {
    const ig = new IgApiClient();
    ig.state.generateDevice(account.username);
    await ig.account.login(account.credentials.username, account.credentials.password);
    if (media?.[0]?.url) {
      const buf    = Buffer.from((await axios.get(media[0].url, { responseType: 'arraybuffer' })).data);
      const result = await ig.publish.photo({ file: buf, caption });
      return { platform: 'instagram', id: result.media.id, caption };
    }
    return { platform: 'instagram', message: 'Instagram requires media. Caption saved.' };
  },

  async _facebookPost(account, message, media) {
    const token  = account.credentials.accessToken;
    const pageId = account.username;
    const params = { message, access_token: token };
    if (media?.[0]?.url) params.link = media[0].url;
    const resp = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, params);
    return { platform: 'facebook', id: resp.data.id };
  },

  async _linkedinPost(account, text, media) {
    const token     = account.credentials.accessToken;
    const personUrn = `urn:li:person:${account.credentials.appId}`;
    const payload   = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
    const resp = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    });
    return { platform: 'linkedin', id: resp.data.id };
  },
};

module.exports = SocialService;
