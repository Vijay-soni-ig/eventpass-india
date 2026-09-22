# Production Readiness Checklist

P0/P1 gates:
- [ ] Staging environment.
- [ ] Production object storage.
- [ ] Monitoring/alerting.
- [ ] Real payment-provider verification.
- [ ] Backup/restore drill.
- [ ] Branch protection.
- [ ] Production secrets management.
- [ ] Database migration procedure.
- [ ] Rollback procedure.
- [ ] Error tracking.
- [ ] Security regression suite.
- [ ] Critical E2E suite.
- [ ] Accessibility/responsive verification.
- [ ] Privacy/data retention review.
- [ ] Operational support process.

If Razorpay is unavailable, continue independent engineering with mocks/provider abstractions but mark live payment verification BLOCKED.

Launch requires no P0 and no unresolved critical payment, authorization, tenant-isolation, data-integrity or recovery issue.