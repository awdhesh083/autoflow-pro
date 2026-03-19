'use strict';
/**
 * Permission Guard Middleware
 *
 * Two guards:
 *   featureGuard(feature)   — checks if the user's plan includes this feature
 *   permissionGuard(perm)   — checks if the team member has this permission
 *
 * Usage in routes:
 *   router.post('/broadcast', featureGuard('whatsappBulk'), permissionGuard('canSendCampaigns'), handler)
 *
 * Plan features (from saas.service.js PLANS):
 *   whatsappBulk, emailBulk, smsBulk, socialAutomation, aiFeatures,
 *   advancedAnalytics, apiAccess, whiteLabel, teamCollaboration
 *
 * Team permissions (role defaults in saas.service.js):
 *   canSendCampaigns, canManageContacts, canViewAnalytics,
 *   canManageAccounts, canManageTeam, canManageBilling, canAccessAPI
 */
const mongoose = require('mongoose');

// ── Lazy-load Tenant model to avoid circular deps ─────────────────────────
let _Tenant = null;
function getTenant() {
  if (!_Tenant) {
    _Tenant = mongoose.models.Tenant || require('../services/saas.service').Tenant;
  }
  return _Tenant;
}

// ── Feature guard — plan-level access ────────────────────────────────────
const featureGuard = (feature) => async (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next(); // skip in tests

  try {
    const Tenant = getTenant();
    const tenant = await Tenant.findOne({ ownerId: req.user._id })
      .select('plan isActive trialEnds').lean();

    // No tenant = free solo user — use plan from User model
    const plan = tenant?.plan || req.user?.plan || 'free';

    // Load PLANS lazily
    const { PLANS } = require('../services/saas.service');
    const planDef   = PLANS[plan];
    if (!planDef) return next(); // unknown plan — fail open

    // Check trial
    const onTrial = tenant?.trialEnds && new Date(tenant.trialEnds) > new Date();

    const hasFeature = onTrial || planDef.features?.[feature] === true;

    if (!hasFeature) {
      return res.status(403).json({
        success:  false,
        message:  `Your ${plan} plan does not include ${feature}. Upgrade to access this feature.`,
        feature,
        upgradeUrl: '/api/v1/saas/plans',
        currentPlan: plan,
      });
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    // Fail open — don't block on plan lookup errors
    next();
  }
};

// ── Permission guard — team member role ──────────────────────────────────
const permissionGuard = (permission) => async (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();

  try {
    const Tenant = getTenant();
    const tenant = await Tenant.findOne({
      $or: [
        { ownerId: req.user._id },
        { 'teamMembers.userId': req.user._id },
      ],
    }).select('ownerId teamMembers').lean();

    if (!tenant) return next(); // solo user — no restrictions

    // Owner always has all permissions
    if (String(tenant.ownerId) === String(req.user._id)) return next();

    // Find team member record
    const member = tenant.teamMembers?.find(
      m => String(m.userId) === String(req.user._id)
    );

    if (!member) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this workspace.',
      });
    }

    // Check specific permission
    const hasPermission = member.permissions?.[permission] !== false;

    if (!hasPermission) {
      return res.status(403).json({
        success:    false,
        message:    `Your role (${member.role}) does not have permission: ${permission}`,
        permission,
        role:       member.role,
      });
    }

    req.teamMember = member;
    next();
  } catch {
    next(); // fail open
  }
};

// ── Usage guard — quota enforcement ──────────────────────────────────────
const usageGuard = (type) => async (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();

  try {
    const { usageGuard: saasUsageGuard } = require('../services/saas.service');
    return saasUsageGuard(type)(req, res, next);
  } catch {
    next();
  }
};

module.exports = { featureGuard, permissionGuard, usageGuard };
