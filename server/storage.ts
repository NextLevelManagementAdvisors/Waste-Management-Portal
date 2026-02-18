/**
 * storage.ts — facade over domain repositories.
 *
 * All callers import `storage` from here as before; only this file needs to
 * know which repository implements each method.
 */

export { pool } from './db';
export type { DbUser, DbProperty } from './db';

import { UserRepository } from './repositories/UserRepository';
import { PropertyRepository } from './repositories/PropertyRepository';
import { PasswordResetRepository } from './repositories/PasswordResetRepository';
import { BillingRepository } from './repositories/BillingRepository';
import { PickupRepository } from './repositories/PickupRepository';
import { ReferralRepository } from './repositories/ReferralRepository';
import { PropertyTransferRepository } from './repositories/PropertyTransferRepository';
import { AdminRepository } from './repositories/AdminRepository';
import { ConversationRepository } from './repositories/ConversationRepository';
import { DriverRepository } from './repositories/DriverRepository';

class Storage {
  private users = new UserRepository();
  private properties = new PropertyRepository();
  private passwordResets = new PasswordResetRepository();
  private billing = new BillingRepository();
  private pickups = new PickupRepository();
  private referrals = new ReferralRepository();
  private transfers = new PropertyTransferRepository();
  private admin = new AdminRepository();
  private conversations = new ConversationRepository();
  private drivers = new DriverRepository();

  // ── Users ──────────────────────────────────────────────────────────────────
  createUser = this.users.createUser.bind(this.users);
  getUserById = this.users.getUserById.bind(this.users);
  getUserByEmail = this.users.getUserByEmail.bind(this.users);
  updateUser = this.users.updateUser.bind(this.users);
  getAllUsers = this.users.getAllUsers.bind(this.users);
  setUserAdmin = this.users.setUserAdmin.bind(this.users);
  searchUsers = this.users.searchUsers.bind(this.users);
  getAllUsersPaginated = this.users.getAllUsersPaginated.bind(this.users);
  updateUserAdmin = this.users.updateUserAdmin.bind(this.users);
  getUsersForExport = this.users.getUsersForExport.bind(this.users);
  globalSearch = this.users.globalSearch.bind(this.users);
  getSignupTrends = this.users.getSignupTrends.bind(this.users);

  // ── Properties ─────────────────────────────────────────────────────────────
  createProperty = this.properties.createProperty.bind(this.properties);
  getPropertiesByUserId = this.properties.getPropertiesByUserId.bind(this.properties);
  getPropertyById = this.properties.getPropertyById.bind(this.properties);
  updateProperty = this.properties.updateProperty.bind(this.properties);
  getAllProperties = this.properties.getAllProperties.bind(this.properties);
  getPropertyStats = this.properties.getPropertyStats.bind(this.properties);

  // ── Password resets ────────────────────────────────────────────────────────
  createPasswordResetToken = this.passwordResets.createPasswordResetToken.bind(this.passwordResets);
  getPasswordResetToken = this.passwordResets.getPasswordResetToken.bind(this.passwordResets);
  markPasswordResetTokenUsed = this.passwordResets.markPasswordResetTokenUsed.bind(this.passwordResets);

  // ── Billing / Stripe ───────────────────────────────────────────────────────
  getProduct = this.billing.getProduct.bind(this.billing);
  listProducts = this.billing.listProducts.bind(this.billing);
  listProductsWithPrices = this.billing.listProductsWithPrices.bind(this.billing);
  getPrice = this.billing.getPrice.bind(this.billing);
  listPrices = this.billing.listPrices.bind(this.billing);
  getPricesForProduct = this.billing.getPricesForProduct.bind(this.billing);
  getSubscription = this.billing.getSubscription.bind(this.billing);
  listSubscriptions = this.billing.listSubscriptions.bind(this.billing);
  getCustomer = this.billing.getCustomer.bind(this.billing);
  listInvoices = this.billing.listInvoices.bind(this.billing);
  getInvoice = this.billing.getInvoice.bind(this.billing);
  listPaymentMethods = this.billing.listPaymentMethods.bind(this.billing);

  // ── Pickups, feedback, dismissals, alerts ──────────────────────────────────
  getActiveServiceAlerts = this.pickups.getActiveServiceAlerts.bind(this.pickups);
  createMissedPickupReport = this.pickups.createMissedPickupReport.bind(this.pickups);
  getMissedPickupReports = this.pickups.getMissedPickupReports.bind(this.pickups);
  updateMissedPickupStatus = this.pickups.updateMissedPickupStatus.bind(this.pickups);
  createSpecialPickupRequest = this.pickups.createSpecialPickupRequest.bind(this.pickups);
  getSpecialPickupRequests = this.pickups.getSpecialPickupRequests.bind(this.pickups);
  getSpecialPickupServices = this.pickups.getSpecialPickupServices.bind(this.pickups);
  upsertCollectionIntent = this.pickups.upsertCollectionIntent.bind(this.pickups);
  deleteCollectionIntent = this.pickups.deleteCollectionIntent.bind(this.pickups);
  getCollectionIntent = this.pickups.getCollectionIntent.bind(this.pickups);
  upsertDriverFeedback = this.pickups.upsertDriverFeedback.bind(this.pickups);
  getDriverFeedback = this.pickups.getDriverFeedback.bind(this.pickups);
  getDriverFeedbackForProperty = this.pickups.getDriverFeedbackForProperty.bind(this.pickups);
  getTipDismissal = this.pickups.getTipDismissal.bind(this.pickups);
  createTipDismissal = this.pickups.createTipDismissal.bind(this.pickups);
  getTipDismissalsForProperty = this.pickups.getTipDismissalsForProperty.bind(this.pickups);

  // ── Referrals ──────────────────────────────────────────────────────────────
  getOrCreateReferralCode = this.referrals.getOrCreateReferralCode.bind(this.referrals);
  getReferralsByUser = this.referrals.getReferralsByUser.bind(this.referrals);
  getReferralTotalRewards = this.referrals.getReferralTotalRewards.bind(this.referrals);
  createReferral = this.referrals.createReferral.bind(this.referrals);
  findReferrerByCode = this.referrals.findReferrerByCode.bind(this.referrals);
  completeReferral = this.referrals.completeReferral.bind(this.referrals);
  getPendingReferralForEmail = this.referrals.getPendingReferralForEmail.bind(this.referrals);

  // ── Property transfers ─────────────────────────────────────────────────────
  initiateTransfer = this.transfers.initiateTransfer.bind(this.transfers);
  getPropertyByTransferToken = this.transfers.getPropertyByTransferToken.bind(this.transfers);
  completeTransfer = this.transfers.completeTransfer.bind(this.transfers);
  cancelTransfer = this.transfers.cancelTransfer.bind(this.transfers);

  // ── Admin / analytics ─────────────────────────────────────────────────────
  getAdminStats = this.admin.getAdminStats.bind(this.admin);
  createAuditLog = this.admin.createAuditLog.bind(this.admin);
  getAuditLogs = this.admin.getAuditLogs.bind(this.admin);
  createAdminNote = this.admin.createAdminNote.bind(this.admin);
  getAdminNotes = this.admin.getAdminNotes.bind(this.admin);
  deleteAdminNote = this.admin.deleteAdminNote.bind(this.admin);

  // ── Conversations / messaging ──────────────────────────────────────────────
  createConversation = this.conversations.createConversation.bind(this.conversations);
  getConversations = this.conversations.getConversations.bind(this.conversations);
  getAllConversations = this.conversations.getAllConversations.bind(this.conversations);
  getConversationById = this.conversations.getConversationById.bind(this.conversations);
  getConversationParticipants = this.conversations.getConversationParticipants.bind(this.conversations);
  isParticipant = this.conversations.isParticipant.bind(this.conversations);
  getMessages = this.conversations.getMessages.bind(this.conversations);
  createMessage = this.conversations.createMessage.bind(this.conversations);
  markConversationRead = this.conversations.markConversationRead.bind(this.conversations);
  updateConversationStatus = this.conversations.updateConversationStatus.bind(this.conversations);
  getConversationsForCustomer = this.conversations.getConversationsForCustomer.bind(this.conversations);
  getUnreadCount = this.conversations.getUnreadCount.bind(this.conversations);

  // ── Drivers / jobs / W9 ───────────────────────────────────────────────────
  createDriver = this.drivers.createDriver.bind(this.drivers);
  getDrivers = this.drivers.getDrivers.bind(this.drivers);
  getDriverById = this.drivers.getDriverById.bind(this.drivers);
  getDriverByEmail = this.drivers.getDriverByEmail.bind(this.drivers);
  updateDriver = this.drivers.updateDriver.bind(this.drivers);
  createW9 = this.drivers.createW9.bind(this.drivers);
  getW9ByDriverId = this.drivers.getW9ByDriverId.bind(this.drivers);
  getOpenJobs = this.drivers.getOpenJobs.bind(this.drivers);
  getJobById = this.drivers.getJobById.bind(this.drivers);
  getJobBids = this.drivers.getJobBids.bind(this.drivers);
  createBid = this.drivers.createBid.bind(this.drivers);
  deleteBid = this.drivers.deleteBid.bind(this.drivers);
  getBidByJobAndDriver = this.drivers.getBidByJobAndDriver.bind(this.drivers);
  updateJob = this.drivers.updateJob.bind(this.drivers);
  getDriverJobs = this.drivers.getDriverJobs.bind(this.drivers);
  getDriverSchedule = this.drivers.getDriverSchedule.bind(this.drivers);

  // ── Raw query escape-hatch (for one-off queries not covered by repositories) ──
  query = (text: string, params?: any[]) => this.users.query(text, params);

  // ── Backward-compatible aliases ────────────────────────────────────────────
  /** @deprecated use getPropertiesByUserId */
  getPropertiesForUser = this.properties.getPropertiesByUserId.bind(this.properties);
}

export const storage = new Storage();
