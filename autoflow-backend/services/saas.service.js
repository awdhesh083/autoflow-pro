/**
 * ══════════════════════════════════════════════════════════
 * MULTI-TENANT SAAS SERVICE
 * Features:
 *  - Subscription plans (Free/Starter/Pro/Enterprise)
 *  - Stripe billing + webhooks
 *  - Usage metering (messages sent, contacts, campaigns)
 *  - Per-tenant data isolation
 *  - White-label (custom domain, logo, colors)
 *  - Sub-accounts / team members
 *  - Reseller / agency panel
 *  - Auto-upgrade/downgrade
 *  - Affiliate & referral tracking
 * ══════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
// Lazy Stripe — won't crash on startup if key is missing
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
const crypto   = require('crypto');
const logger   = require('../utils/logger');

// ── PLAN DEFINITIONS ──────────────────────────────────────
const PLANS = {
  free: {
    name:        'Free',
    price:       0,
    stripePriceId: null,
    limits: {
      contacts:          500,
      emailsPerMonth:    1000,
      waMessagesPerMonth:500,
      smsPerMonth:       0,
      campaigns:         5,
      teamMembers:       1,
      apiCallsPerDay:    100,
      sequences:         2,
      accounts:          2,
    },
    features: {
      whatsapp:     true,
      email:        true,
      sms:          false,
      instagram:    false,
      facebook:     false,
      discord:      false,
      aiImage:      false,
      leadScraper:  false,
      whiteLabel:   false,
      apiAccess:    false,
      analytics:    'basic',
      support:      'community',
    }
  },
  starter: {
    name:        'Starter',
    price:       29,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    limits: {
      contacts:          5000,
      emailsPerMonth:    10000,
      waMessagesPerMonth:5000,
      smsPerMonth:       500,
      campaigns:         50,
      teamMembers:       3,
      apiCallsPerDay:    1000,
      sequences:         10,
      accounts:          10,
    },
    features: {
      whatsapp:     true,
      email:        true,
      sms:          true,
      instagram:    true,
      facebook:     false,
      discord:      false,
      aiImage:      true,
      leadScraper:  false,
      whiteLabel:   false,
      apiAccess:    true,
      analytics:    'advanced',
      support:      'email',
    }
  },
  pro: {
    name:        'Pro',
    price:       79,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
    limits: {
      contacts:          50000,
      emailsPerMonth:    100000,
      waMessagesPerMonth:50000,
      smsPerMonth:       5000,
      campaigns:         500,
      teamMembers:       10,
      apiCallsPerDay:    10000,
      sequences:         100,
      accounts:          50,
    },
    features: {
      whatsapp:     true,
      email:        true,
      sms:          true,
      instagram:    true,
      facebook:     true,
      discord:      true,
      aiImage:      true,
      leadScraper:  true,
      whiteLabel:   false,
      apiAccess:    true,
      analytics:    'full',
      support:      'priority',
    }
  },
  enterprise: {
    name:        'Enterprise',
    price:       299,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    limits: {
      contacts:          -1,   // unlimited
      emailsPerMonth:    -1,
      waMessagesPerMonth:-1,
      smsPerMonth:       -1,
      campaigns:         -1,
      teamMembers:       -1,
      apiCallsPerDay:    -1,
      sequences:         -1,
      accounts:          -1,
    },
    features: {
      whatsapp:     true,
      email:        true,
      sms:          true,
      instagram:    true,
      facebook:     true,
      discord:      true,
      aiImage:      true,
      leadScraper:  true,
      whiteLabel:   true,
      apiAccess:    true,
      analytics:    'full',
      support:      'dedicated',
    }
  }
};

// ── MONGOOSE SCHEMAS ──────────────────────────────────────

// Tenant (Organization)
const tenantSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  slug:          { type: String, unique: true },           // subdomain/identifier
  ownerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan:          { type: String, enum: ['free','starter','pro','enterprise'], default: 'free' },

  // Stripe
  stripeCustomerId:     String,
  stripeSubscriptionId: String,
  subscriptionStatus:   { type: String, enum: ['active','past_due','canceled','trialing','paused'], default: 'active' },
  trialEndsAt:          Date,
  currentPeriodEnd:     Date,
  cancelAtPeriodEnd:    { type: Boolean, default: false },

  // White-label
  branding: {
    logo:          String,
    favicon:       String,
    primaryColor:  { type: String, default: '#00d4ff' },
    accentColor:   { type: String, default: '#7c3aed' },
    companyName:   String,
    customDomain:  String,
    customDomainVerified: { type: Boolean, default: false },
    supportEmail:  String,
    hideAutoflowBranding: { type: Boolean, default: false },
  },

  // Usage this month
  usage: {
    emailsSent:     { type: Number, default: 0 },
    waSent:         { type: Number, default: 0 },
    smsSent:        { type: Number, default: 0 },
    apiCalls:       { type: Number, default: 0 },
    resetDate:      { type: Date, default: Date.now },
  },

  // Referral / affiliate
  referralCode:     String,
  referredBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  affiliateBalance: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  settings: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Team Member
const teamMemberSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  role:      { type: String, enum: ['owner','admin','manager','member','viewer'], default: 'member' },
  permissions: {
    canSendCampaigns:   { type: Boolean, default: true },
    canManageContacts:  { type: Boolean, default: true },
    canViewAnalytics:   { type: Boolean, default: true },
    canManageAccounts:  { type: Boolean, default: false },
    canManageTeam:      { type: Boolean, default: false },
    canManageBilling:   { type: Boolean, default: false },
    canAccessAPI:       { type: Boolean, default: false },
  },
  inviteToken:    String,
  inviteAccepted: { type: Boolean, default: false },
  invitedAt:      Date,
  joinedAt:       Date,
}, { timestamps: true });

teamMemberSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

// Usage Log (for metering)
const usageLogSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, enum: ['email','whatsapp','sms','api_call','ai_generation','image_generation','contact_created','campaign_launched'] },
  count:     { type: Number, default: 1 },
  meta:      mongoose.Schema.Types.Mixed,
  date:      { type: Date, default: Date.now, index: true },
}, { timestamps: false });

usageLogSchema.index({ tenantId: 1, type: 1, date: -1 });

// Invoice
const invoiceSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  stripeInvoiceId:String,
  amount:         Number,
  currency:       { type: String, default: 'usd' },
  status:         { type: String, enum: ['draft','open','paid','void','uncollectible'] },
  plan:           String,
  periodStart:    Date,
  periodEnd:      Date,
  pdfUrl:         String,
  paidAt:         Date,
}, { timestamps: true });

// Affiliate Payout
const affiliateSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  referredTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  amount:         Number,
  status:         { type: String, enum: ['pending','approved','paid'], default: 'pending' },
  stripeTransferId: String,
  paidAt:         Date,
}, { timestamps: true });

const Tenant     = mongoose.model('Tenant',     tenantSchema);
const TeamMember = mongoose.model('TeamMember', teamMemberSchema);
const UsageLog   = mongoose.model('UsageLog',   usageLogSchema);
const Invoice    = mongoose.model('Invoice',    invoiceSchema);
const Affiliate  = mongoose.model('Affiliate',  affiliateSchema);

// ── SAAS SERVICE ──────────────────────────────────────────
class SaaSService {

  // ── Create tenant on registration ──────────────────────
  async createTenant(user, options = {}) {
    const slug = await this._generateSlug(user.name || user.email.split('@')[0]);
    const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    const tenant = await Tenant.create({
      name:         options.companyName || user.name,
      slug,
      ownerId:      user._id,
      plan:         'free',
      referralCode,
      referredBy:   options.referredByTenantId || null,
      trialEndsAt:  new Date(Date.now() + 14 * 86400000),  // 14-day trial
      branding: {
        companyName: options.companyName || user.name,
        primaryColor: '#00d4ff',
      },
    });

    // Add owner as team member
    await TeamMember.create({
      tenantId:       tenant._id,
      userId:         user._id,
      role:           'owner',
      inviteAccepted: true,
      joinedAt:       new Date(),
      permissions: {
        canSendCampaigns:  true,
        canManageContacts: true,
        canViewAnalytics:  true,
        canManageAccounts: true,
        canManageTeam:     true,
        canManageBilling:  true,
        canAccessAPI:      true,
      }
    });

    // Create Stripe customer
    if (process.env.STRIPE_SECRET_KEY) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name:  tenant.name,
        metadata: { tenantId: tenant._id.toString(), userId: user._id.toString() },
      });
      await Tenant.findByIdAndUpdate(tenant._id, { stripeCustomerId: customer.id });
    }

    // Referral tracking
    if (options.referralCode) {
      const referrer = await Tenant.findOne({ referralCode: options.referralCode });
      if (referrer) {
        await Tenant.findByIdAndUpdate(tenant._id, { referredBy: referrer._id });
      }
    }

    logger.info(`✅ Tenant created: ${tenant.slug} (${tenant._id})`);
    return tenant;
  }

  // ── Create Stripe checkout session ─────────────────────
  async createCheckoutSession(tenantId, planName, successUrl, cancelUrl) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const plan = PLANS[planName];
    if (!plan?.stripePriceId) throw new Error('Invalid plan or no Stripe price configured');

    const session = await getStripe().checkout.sessions.create({
      customer:             tenant.stripeCustomerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price:    plan.stripePriceId,
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenantId: tenantId.toString(), plan: planName },
      },
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl,
      metadata: { tenantId: tenantId.toString(), plan: planName },
    });

    return { url: session.url, sessionId: session.id };
  }

  // ── Create billing portal session ──────────────────────
  async createBillingPortal(tenantId, returnUrl) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant?.stripeCustomerId) throw new Error('No Stripe customer found');

    const session = await getStripe().billingPortal.sessions.create({
      customer:   tenant.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ── Handle Stripe webhook ───────────────────────────────
  async handleStripeWebhook(rawBody, signature) {
    const event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { tenantId, plan } = session.metadata;
        await Tenant.findByIdAndUpdate(tenantId, {
          plan,
          stripeSubscriptionId: session.subscription,
          subscriptionStatus:   'active',
          currentPeriodEnd:     new Date(Date.now() + 30 * 86400000),
        });
        logger.info(`✅ Subscription activated: tenant ${tenantId} → ${plan}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const tenant  = await Tenant.findOne({ stripeCustomerId: invoice.customer });
        if (tenant) {
          await Invoice.create({
            tenantId:        tenant._id,
            stripeInvoiceId: invoice.id,
            amount:          invoice.amount_paid / 100,
            status:          'paid',
            pdfUrl:          invoice.invoice_pdf,
            paidAt:          new Date(),
          });

          // Reset monthly usage
          await Tenant.findByIdAndUpdate(tenant._id, {
            'usage.emailsSent': 0,
            'usage.waSent':     0,
            'usage.smsSent':    0,
            'usage.apiCalls':   0,
            'usage.resetDate':  new Date(),
            currentPeriodEnd:   new Date(invoice.lines.data[0]?.period?.end * 1000),
          });

          // Pay affiliate commission (20%)
          if (tenant.referredBy) {
            const commission = Math.floor(invoice.amount_paid * 0.20) / 100;
            await Affiliate.create({
              tenantId:         tenant.referredBy,
              referredTenantId: tenant._id,
              amount:           commission,
              status:           'pending',
            });
            await Tenant.findByIdAndUpdate(tenant.referredBy, {
              $inc: { affiliateBalance: commission }
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const tenant = await Tenant.findOne({ stripeSubscriptionId: sub.id });
        if (tenant) {
          const plan = sub.items.data[0]?.price?.metadata?.plan || tenant.plan;
          await Tenant.findByIdAndUpdate(tenant._id, {
            plan,
            subscriptionStatus: sub.status,
            cancelAtPeriodEnd:  sub.cancel_at_period_end,
            currentPeriodEnd:   new Date(sub.current_period_end * 1000),
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const tenant = await Tenant.findOne({ stripeSubscriptionId: sub.id });
        if (tenant) {
          await Tenant.findByIdAndUpdate(tenant._id, {
            plan:               'free',
            subscriptionStatus: 'canceled',
          });
          logger.info(`Subscription canceled: tenant ${tenant._id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv    = event.data.object;
        const tenant = await Tenant.findOne({ stripeCustomerId: inv.customer });
        if (tenant) {
          await Tenant.findByIdAndUpdate(tenant._id, { subscriptionStatus: 'past_due' });
        }
        break;
      }
    }

    return { received: true };
  }

  // ── Check feature access ────────────────────────────────
  async checkFeatureAccess(tenantId, feature) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return false;

    // Trial always gets Pro features
    if (tenant.trialEndsAt && tenant.trialEndsAt > new Date()) return true;

    const plan = PLANS[tenant.plan];
    return plan?.features?.[feature] || false;
  }

  // ── Check & enforce usage limits ───────────────────────
  async checkUsageLimit(tenantId, type) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return { allowed: false, reason: 'Tenant not found' };

    const plan   = PLANS[tenant.plan];
    const limits = plan?.limits;

    // Trial gets Pro limits
    if (tenant.trialEndsAt > new Date()) return { allowed: true, trial: true };

    const limitMap = {
      email:     { key: 'emailsPerMonth',    usage: 'emailsSent'  },
      whatsapp:  { key: 'waMessagesPerMonth', usage: 'waSent'      },
      sms:       { key: 'smsPerMonth',        usage: 'smsSent'     },
      api_call:  { key: 'apiCallsPerDay',     usage: 'apiCalls'    },
    };

    const mapping = limitMap[type];
    if (!mapping) return { allowed: true };

    const limit   = limits?.[mapping.key];
    const current = tenant.usage?.[mapping.usage] || 0;

    if (limit === -1) return { allowed: true, unlimited: true };
    if (current >= limit) {
      return {
        allowed:  false,
        reason:   `Monthly ${type} limit reached (${current}/${limit})`,
        upgrade:  this._nextPlan(tenant.plan),
        current,
        limit,
      };
    }

    return { allowed: true, current, limit, remaining: limit - current };
  }

  // ── Track usage ─────────────────────────────────────────
  async trackUsage(tenantId, userId, type, count = 1, meta = {}) {
    const updateMap = {
      email:    { field: 'emailsSent' },
      whatsapp: { field: 'waSent'     },
      sms:      { field: 'smsSent'    },
      api_call: { field: 'apiCalls'   },
    };

    const update = updateMap[type];
    if (update) {
      await Tenant.findByIdAndUpdate(tenantId, { $inc: { [`usage.${update.field}`]: count } });
    }

    await UsageLog.create({ tenantId, userId, type, count, meta });
  }

  // ── Get usage stats ─────────────────────────────────────
  async getUsageStats(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    const plan   = PLANS[tenant?.plan || 'free'];

    const [emailCount, waCount, smsCount, apiCount] = await Promise.all([
      UsageLog.aggregate([
        { $match: { tenantId: tenant._id, type: 'email', date: { $gte: tenant.usage.resetDate } } },
        { $group: { _id: null, total: { $sum: '$count' } } }
      ]),
      UsageLog.aggregate([
        { $match: { tenantId: tenant._id, type: 'whatsapp', date: { $gte: tenant.usage.resetDate } } },
        { $group: { _id: null, total: { $sum: '$count' } } }
      ]),
      UsageLog.aggregate([
        { $match: { tenantId: tenant._id, type: 'sms', date: { $gte: tenant.usage.resetDate } } },
        { $group: { _id: null, total: { $sum: '$count' } } }
      ]),
      UsageLog.aggregate([
        { $match: { tenantId: tenant._id, type: 'api_call', date: { $gte: new Date(Date.now() - 86400000) } } },
        { $group: { _id: null, total: { $sum: '$count' } } }
      ]),
    ]);

    return {
      plan:     tenant.plan,
      limits:   plan.limits,
      features: plan.features,
      usage: {
        emailsSent:  emailCount[0]?.total  || 0,
        waSent:      waCount[0]?.total     || 0,
        smsSent:     smsCount[0]?.total    || 0,
        apiCallsToday: apiCount[0]?.total  || 0,
      },
      percentages: {
        email:    this._pct(emailCount[0]?.total, plan.limits.emailsPerMonth),
        whatsapp: this._pct(waCount[0]?.total,    plan.limits.waMessagesPerMonth),
        sms:      this._pct(smsCount[0]?.total,   plan.limits.smsPerMonth),
        api:      this._pct(apiCount[0]?.total,   plan.limits.apiCallsPerDay),
      },
      subscriptionStatus: tenant.subscriptionStatus,
      currentPeriodEnd:   tenant.currentPeriodEnd,
      trialEndsAt:        tenant.trialEndsAt,
      cancelAtPeriodEnd:  tenant.cancelAtPeriodEnd,
    };
  }

  // ── Invite team member ──────────────────────────────────
  async inviteTeamMember(tenantId, invitedByUserId, email, role = 'member', permissions = {}) {
    const tenant = await Tenant.findById(tenantId);
    const plan   = PLANS[tenant.plan];

    // Check team limit
    const currentCount = await TeamMember.countDocuments({ tenantId, inviteAccepted: true });
    if (plan.limits.teamMembers !== -1 && currentCount >= plan.limits.teamMembers) {
      throw new Error(`Team member limit reached for ${tenant.plan} plan (max ${plan.limits.teamMembers})`);
    }

    const { User } = require('../models');
    let user = await User.findOne({ email });

    // Create placeholder user if not registered yet
    if (!user) {
      user = await User.create({
        name:     email.split('@')[0],
        email,
        password: crypto.randomBytes(16).toString('hex'), // random pw
        isActive: false,
      });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');

    const member = await TeamMember.findOneAndUpdate(
      { tenantId, userId: user._id },
      {
        tenantId, userId: user._id, role,
        permissions: { ...this._defaultPermissions(role), ...permissions },
        inviteToken,
        inviteAccepted: false,
        invitedAt:      new Date(),
      },
      { upsert: true, new: true }
    );

    // Send invite email
    const EmailService = require('./email.service');
    const inviteUrl    = `${process.env.BASE_URL}/invite/${inviteToken}`;
    await EmailService.sendEmail({
      to:       email,
      from:     process.env.SMTP_FROM_EMAIL,
      fromName: tenant.branding?.companyName || 'AutoFlow',
      subject:  `You've been invited to join ${tenant.name} on AutoFlow`,
      html: `
        <h2>You're invited!</h2>
        <p>${invitedByUserId} has invited you to join <strong>${tenant.name}</strong> as a <strong>${role}</strong>.</p>
        <a href="${inviteUrl}" style="background:#00d4ff;color:#000;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          Accept Invitation
        </a>
        <p>This link expires in 7 days.</p>
      `,
    }).catch(() => {});

    return { member, inviteToken, inviteUrl };
  }

  // ── Accept invite ───────────────────────────────────────
  async acceptInvite(inviteToken, userId) {
    const member = await TeamMember.findOneAndUpdate(
      { inviteToken },
      { inviteAccepted: true, inviteToken: null, joinedAt: new Date(), userId },
      { new: true }
    );
    if (!member) throw new Error('Invalid or expired invite token');

    await require('../models').User.findByIdAndUpdate(userId, { isActive: true });
    return member;
  }

  // ── Update white-label branding ─────────────────────────
  async updateBranding(tenantId, branding) {
    const tenant = await Tenant.findById(tenantId);
    if (!PLANS[tenant.plan]?.features?.whiteLabel) {
      throw new Error('White-label requires Enterprise plan');
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenantId,
      { branding: { ...tenant.branding, ...branding } },
      { new: true }
    );

    return updated.branding;
  }

  // ── Verify custom domain ────────────────────────────────
  async verifyCustomDomain(tenantId, domain) {
    const dns    = require('dns').promises;
    const tenant = await Tenant.findById(tenantId);

    try {
      const records = await dns.resolveTxt(`_autoflow.${domain}`);
      const expected = `autoflow-verify=${tenant.slug}`;
      const verified = records.flat().includes(expected);

      if (verified) {
        await Tenant.findByIdAndUpdate(tenantId, {
          'branding.customDomain':         domain,
          'branding.customDomainVerified': true,
        });
      }

      return {
        verified,
        domain,
        required: expected,
        instructions: `Add a TXT record: _autoflow.${domain} → ${expected}`,
      };
    } catch {
      return { verified: false, domain, instructions: `Add a TXT record: _autoflow.${domain} → autoflow-verify=${tenant.slug}` };
    }
  }

  // ── Get affiliate stats ─────────────────────────────────
  async getAffiliateStats(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    const [referrals, payouts] = await Promise.all([
      Tenant.find({ referredBy: tenantId }).select('name plan createdAt'),
      Affiliate.find({ tenantId }).sort('-createdAt'),
    ]);

    const totalEarned = payouts.reduce((sum, p) => sum + p.amount, 0);
    const pending     = payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

    return {
      referralCode:  tenant.referralCode,
      referralUrl:   `${process.env.BASE_URL}/ref/${tenant.referralCode}`,
      totalReferrals:referrals.length,
      referrals,
      totalEarned,
      pendingPayout: pending,
      balance:       tenant.affiliateBalance,
      payouts,
    };
  }

  // ── Admin: get all tenants ──────────────────────────────
  async getAllTenants(options = {}) {
    const { page = 1, limit = 20, plan, status } = options;
    const q = {};
    if (plan)   q.plan                = plan;
    if (status) q.subscriptionStatus  = status;

    const [tenants, total] = await Promise.all([
      Tenant.find(q).skip((page-1)*limit).limit(+limit).sort('-createdAt').populate('ownerId', 'name email'),
      Tenant.countDocuments(q),
    ]);

    const stats = await Tenant.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 }, revenue: { $sum: {
        $switch: { branches: [
          { case: { $eq: ['$plan','starter']   }, then: 29  },
          { case: { $eq: ['$plan','pro']       }, then: 79  },
          { case: { $eq: ['$plan','enterprise']}, then: 299 },
        ], default: 0 }
      }}}}
    ]);

    return { tenants, total, stats };
  }

  // ── Helpers ─────────────────────────────────────────────
  async _generateSlug(base) {
    let slug = base.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
    let count = 0;
    while (await Tenant.findOne({ slug })) {
      slug = `${slug}-${++count}`;
    }
    return slug;
  }

  _nextPlan(current) {
    const order = ['free','starter','pro','enterprise'];
    const idx   = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : null;
  }

  _pct(used, limit) {
    if (!limit || limit === -1) return 0;
    return Math.min(100, Math.round((used || 0) / limit * 100));
  }

  _defaultPermissions(role) {
    const perms = {
      admin:   { canSendCampaigns: true,  canManageContacts: true,  canViewAnalytics: true,  canManageAccounts: true,  canManageTeam: true,  canManageBilling: false, canAccessAPI: true  },
      manager: { canSendCampaigns: true,  canManageContacts: true,  canViewAnalytics: true,  canManageAccounts: true,  canManageTeam: false, canManageBilling: false, canAccessAPI: false },
      member:  { canSendCampaigns: true,  canManageContacts: true,  canViewAnalytics: true,  canManageAccounts: false, canManageTeam: false, canManageBilling: false, canAccessAPI: false },
      viewer:  { canSendCampaigns: false, canManageContacts: false, canViewAnalytics: true,  canManageAccounts: false, canManageTeam: false, canManageBilling: false, canAccessAPI: false },
    };
    return perms[role] || perms.member;
  }
}

// ── Usage Guard Middleware ─────────────────────────────────
const usageGuard = (type) => async (req, res, next) => {
  if (!req.user?.tenantId) return next();

  const service = new SaaSService();
  const check   = await service.checkUsageLimit(req.user.tenantId, type);

  if (!check.allowed) {
    return res.status(429).json({
      success: false,
      message: check.reason,
      upgrade: check.upgrade,
      current: check.current,
      limit:   check.limit,
    });
  }

  // Track usage after response
  res.on('finish', () => {
    if (res.statusCode < 400) {
      service.trackUsage(req.user.tenantId, req.user._id, type).catch(() => {});
    }
  });

  next();
};

// ── Feature Guard Middleware ───────────────────────────────
const featureGuard = (feature) => async (req, res, next) => {
  if (!req.user?.tenantId) return next();

  const service = new SaaSService();
  const allowed = await service.checkFeatureAccess(req.user.tenantId, feature);

  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: `${feature} is not available on your current plan`,
      upgrade: true,
    });
  }

  next();
};

module.exports = {
  SaaSService: new SaaSService(),
  Tenant, TeamMember, UsageLog, Invoice, Affiliate,
  PLANS, usageGuard, featureGuard,
};
