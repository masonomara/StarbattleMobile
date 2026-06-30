# Payments Branch

## Overview

I received this message from Apple during my app review, please investigate and tell me what could be going wrong, investigate, and fix:

```text
Apple2026-06-26 3:12 PM
Hello,

Thank you for your resubmission. Upon further review, we identified additional issues that need your attention. See below for more information.

If you have any questions, we are here to help. Reply to this message in App Store Connect and let us know.

Review Environment
Submission ID: 78ccab64-8ef0-4904-bdfc-7339ebe33dd9
Review date: June 26, 2026
Review Device: iPad Air 11-inch (M3) and iPhone 17 Pro Max
Version reviewed: 1.0 (6)

Guideline 2.1(b) - Performance - App Completeness

Issue Description

The In-App Purchase products in the app exhibited one or more bugs which create a poor user experience. Specifically, we found that your app displayed an error message when the "Buy Premium" button was tapped. Review the details and resources below to troubleshoot this issue.

Review device details: 

- Device type: iPad Air 11-inch (M3) 
- OS version: iPadOS 26.5

Next Steps

Apple reviews In-App Purchase products in the sandbox and the In-App Purchase products do not need prior approval to function in review. Review the product configurations, complete any missing information, and test them in the sandbox.

To offer In-App Purchases in the app, the Account Holder must also accept the Paid Apps Agreement in the Business section of App Store Connect. Confirm you have a Paid Apps Agreement in effect.

If you still need assistance after completing the steps and reviewing the resources, visit the Apple Developer Forums. If you can’t find an answer from an existing thread, start a new thread with your question to get guidance from Apple engineers and other developers.

Resources

Learn more about app completeness requirements in guideline 2.1(b).
Support
- Reply to this message in your preferred language if you need assistance. If you need additional support, use the Contact Us module.
- Consult with fellow developers and Apple engineers on the Apple Developer Forums.
- Request an App Review Appointment at Meet with Apple to discuss your app's review. Appointments subject to availability during your local business hours on Tuesdays and Thursdays.
- Provide feedback on this message and your review experience by completing a short survey.
```

### App Store Connect

#### App Agreements

My paid app agreements in my App Store Connect Business section is active.

#### In-App Pruchases

I have a header in my In-App Purchases section that says:

```text
Your first in-app purchase must be submitted with a new app version. Create your in-app purchase, then select it from the app’s In-App Purchases and Subscriptions section on the version page before submitting the version to App Review.

Once your binary has been uploaded and your first-in app purchase has been submitted for review, additional in-app purchases can be submitted from the In-App Purchases section. Learn More
```

I have one product in review. Reference name: `starbattle_premium`. Product ID: `sb_premium_599`. Type: `Non-Consumable`. Status: `Waiting for Review`.

When I go to the `starbattle_premium` details screen, I see:

Status: `Waiting for Review`
Reference Name: `starbattle_premium`
Product ID: `sb_premium_599`
Apple ID: `6771600432`
Availability: `All counties or regions selected`
Price Schedule: (see `docs/feature/payments/Current Price Manually Adjusted 2.csv`)
App Store Localization: Localizations: `English (U.S.)`. Display Name: `Star Battle Premium`. Description: `Unlock all premium features`. Status: `Waiting for Review`
Image: `Uploaded`

### Adapty

#### App Settings

App name: `Star Battle`
App icon: `Uploaded`
Category: `Games`
Installs definition for analytics: Installs defined as `New device_ids`
App Store price increase logic: `When subscription price is changed in App Store Connect it changes for existing subscribers`
Sharing paid access between user accounts: Sharing paid on production `Enabled (default)`, Sharing paid access on sandbox `Enabled (default)`
API keys: Public SDK key `public_live_FQFP8OKb.3ryy8Pc6BjOlgZ4jgtCT` Usedd for configuring Adapty mobile SDK. Secret key used for making API requests from your sever only `secret_live_vX4AsHP0.DDhX0Ydz3YLJfa5a7ZpmkEQuTvCFbLd0`

#### Paywalls

Paywall name: `Main Paywall`
Product name: `Star Battle Premium`
Period: `Lifetime`
Offer: none

#### Products

Product name: `Star Battle Premium`
Access level ID: `premium`
Subscription duration: `Lifetime`
Price (USD): `$5.99`

App Store Settings: Product Sent to App Store
The product has been successfully sent to the App Store and is now being reviewed by Apple. The status in Adapty will update automatically once the review is complete.
App Store Product ID: `sb_premium_599`

#### Access Levels

Access level ID: `premium`

#### Placements

Placement name: `Main Paywall`
Placement ID: `main_paywall`

### UI/UX

I think having all the payment and accoutn sign up stuff on one screen is a bit confusing, open to adding a navigation flwo across multiple screens in the future. Not worth delayign the resubmission for this in my opinion.

## Bugs that Claude caught

These bugs do not fix the rejection but should be fixed independently.

BUG-001:

```text
_productsPromise` (payments.ts:60) caches the result for the whole process. If the first fetch returns **empty or rejects mid-resolve**, every later tap fails until restart.
```

BUG-002:

```text
A `getProducts()` (payments.ts:62) failure leaks a raw SDK error to the generic handler instead of a clear, localized message.
```

BUG-003:

```text
No Adapty **fallback paywall** is set, so a network blip = dead paywall.
```
