# BE ↔ Mobile API status (2026-10-07)

Mobile currently serves the `Trainee` role. This matrix reflects the BE source in the adjacent checkout; an endpoint in source does not prove the deployed binary or provider is ready.

| Mobile flow | BE endpoint | Mobile status |
| --- | --- | --- |
| Local registration | `POST /api/auth/registration/request-otp`, `POST /api/auth/registration/verify-otp`, `POST /api/auth/resend-verification`, `POST /api/auth/register/trainee` | Connected: form → OTP → single-use proof → account; login remains a separate step. |
| Session | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `GET /api/auth/me` | Connected; tokens stay in SecureStore on native devices. |
| Profile and password | `PATCH /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Connected; profile update sends `If-Match` from the latest `GET /api/auth/me`. |
| Avatar | `GET /api/me/avatar`, `POST /api/me/avatar/upload-intent`, `POST /api/me/avatar/complete`, `DELETE /api/me/avatar` | Connected; complete/delete use profile ETag. Signed upload still needs a device/S3 smoke test. |
| Feedback and support | `GET/POST /api/feedback`, `GET/POST /api/support/tickets`, `GET /api/support/tickets/{id}`, `POST /api/support/tickets/{id}/messages` | Connected for authenticated Trainee. |
| Legacy email link | `POST /api/auth/verify-email` | Kept for old pending accounts only; new registration uses OTP. |
| Google | `POST /api/auth/login-firebase`, `POST /api/auth/google/onboarding/complete`, `POST /api/me/link-google` | BE has source, but Mobile has no Firebase project/OAuth client configuration, so no Google sign-in flow is exposed. |
| Device push binding | `PUT /api/auth/devices`, `DELETE /api/auth/devices/{deviceUuid}` | Requires FCM token and a securely generated installation key; Mobile has no push configuration yet. |

BE currently has no complete Trainee contract for Building QR resolution, private participation grants, authorized published-training discovery, session preparation/start, package download, gameplay event/result sync, learner result history, Learn blog, or AI through .NET. The current `GET /api/buildings/{id}/trainings` handler calls `IfcAccess.ResolveAsync`, which rejects `Trainee`; it cannot be used as a learner catalog endpoint. Mobile retains the clearly labeled local demo for those screens until BE exposes and verifies the required Trainee routes.
