# AeroTwin-AI — SIH 2026 Project Blueprint

> **Problem Statement:** AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs
>
> **MVP Constraint:** Software-only prototype; no physical hardware.
>
> **Initial Delivery Constraint:** 10 days for the first presentation/MVP.
>
> **Team:** Saad, Tripti, Manjeet, Aryan, Netra, Anmol.

---

## 1. Executive Summary

AeroTwin-AI is a software-based prototype of an AI-enabled Digital Twin for aero piston engines used in MALE UAVs.

The system will simulate/ingest engine telemetry, maintain a continuously updated digital representation of engine behavior, compare actual behavior against expected behavior, detect anomalies, classify likely faults, estimate an engine health index, and translate engine condition into mission-level risk.

### Core idea

```text
Engine Telemetry
      ↓
Data Processing
      ↓
Digital Twin
      ↓
Actual vs Expected Behavior
      ↓
AI Analysis
      ↓
┌───────────────┬────────────────┬─────────────────┐
│ Anomaly       │ Fault          │ Health          │
│ Detection     │ Classification │ Estimation      │
└───────────────┴────────────────┴─────────────────┘
      ↓
Mission Reliability Assessment
      ↓
Operator Dashboard
```

### Core pitch

> **We don't want to wait for an engine to fail. We want the engine to tell us that it is degrading before it becomes a mission-critical problem.**

### Tagline

> **Predict the Engine. Protect the Mission.**

---

# 2. Problem Statement Breakdown

The selected problem statement contains six major ideas:

| Component | Meaning in AeroTwin-AI |
|---|---|
| AI-Enabled | ML models analyze telemetry and identify abnormal behavior |
| Real-Time | Telemetry is processed continuously in the software prototype |
| Digital Twin | A virtual representation of the engine's expected/current state |
| Health Monitoring | Continuous estimation of engine condition |
| Fault Prediction | Detection/classification of emerging faults |
| Mission Reliability | Translation of engine health into mission-level risk |

The important distinction is:

> A dashboard only displays data. A Digital Twin should represent expected system behavior/state and continuously compare it with the physical or simulated system.

Since this MVP is software-only, the "physical engine" is represented by an **engine simulator and/or available datasets**.

---

# 3. Scope Decision: Software Only

The team has explicitly decided:

- No physical engine
- No ESP32/STM32 hardware
- No Raspberry Pi requirement
- No physical sensors
- No UAV hardware
- No flight-controller integration

Instead, the MVP will use:

1. Synthetic engine telemetry
2. Software engine simulation
3. Fault injection
4. Digital Twin logic
5. AI/ML models
6. Backend APIs
7. Web dashboard

This is appropriate for a 10-day software MVP.

---

# 4. MVP Objective

The first presentation does **not** need to demonstrate a complete aviation-grade Digital Twin.

The MVP must prove the end-to-end concept:

> **Telemetry → Digital Twin → AI → Engine Health → Fault Prediction → Mission Risk → Dashboard**

## MVP must-have features

1. Engine telemetry simulation
2. Digital Twin
3. Actual vs expected state comparison
4. Anomaly detection
5. Engine Health Index
6. Dashboard

## Should-have features

7. Fault classification
8. Mission risk assessment

## Nice-to-have / Phase 2

9. Remaining Useful Life (RUL)
10. Explainable AI
11. Advanced degradation prediction
12. Multi-engine/fleet monitoring
13. Cloud deployment
14. Real-world engine dataset integration

### Priority rule

If time becomes limited:

```text
Telemetry
   ↓
Digital Twin
   ↓
Anomaly Detection
   ↓
Health Score
   ↓
Dashboard
```

is more important than RUL or advanced deep learning.

---

# 5. Target Users

The intended users are:

- UAV operators
- Maintenance engineers
- Mission planners
- Fleet managers
- Reliability engineers

The system is primarily a **decision-support platform**, not an autonomous flight-control system.

---

# 6. Intended System Outcome

The system should answer four questions:

### 1. What is happening?

Example:

> Engine temperature is increasing beyond the expected Digital Twin behavior.

### 2. Why is it happening?

Example:

> Possible overheating / lubrication degradation.

### 3. How serious is it?

Example:

> Engine health has decreased from 92% to 73%.

### 4. What does it mean for the mission?

Example:

> Mission risk has changed from LOW to HIGH.

This progression is one of the project's strongest differentiators.

---

# 7. High-Level System Architecture

```text
                    ┌───────────────────────┐
                    │    ENGINE SIMULATOR   │
                    │                       │
                    │ Normal / Fault Data   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ DATA ACQUISITION      │
                    │ + PREPROCESSING       │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │     DIGITAL TWIN      │
                    │                       │
                    │ Expected Engine State │
                    │ State Estimation      │
                    │ Operating Behavior    │
                    └───────────┬───────────┘
                                │
                     Actual vs Expected
                                │
                                ▼
                    ┌───────────────────────┐
                    │       AI ENGINE       │
                    │                       │
                    │ Anomaly Detection     │
                    │ Fault Classification  │
                    │ Health Estimation     │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ ENGINE HEALTH INDEX   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ MISSION RELIABILITY   │
                    │ ASSESSMENT            │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ OPERATOR DASHBOARD    │
                    │                       │
                    │ Health                │
                    │ Fault                 │
                    │ Trends                │
                    │ Mission Risk          │
                    └───────────────────────┘
```

---

# 8. Recommended Technical Architecture

For a 10-day MVP:

```text
                Python Engine Simulator
                         │
                         ▼
                      FastAPI
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Digital Twin    AI       Mission Model
             │           │           │
             └───────────┼───────────┘
                         ▼
                      REST API
                         │
                         ▼
                  React Dashboard
```

### Recommended stack

#### Backend

- Python
- FastAPI
- NumPy
- Pandas
- Scikit-learn
- XGBoost or Random Forest
- SQLite for MVP

#### Frontend

Preferred:

- React
- TypeScript
- Tailwind CSS
- Recharts or Plotly

If the team is significantly faster in Python:

- Streamlit
- Plotly

may be preferable for the 10-day MVP.

### Important

Do not choose technology based on how impressive it sounds.

Choose the stack the team can implement reliably within 10 days.

---

# 9. Engine Telemetry

The MVP should simulate parameters that are meaningful for an aero piston engine.

Recommended parameters:

| Parameter | Example | Purpose |
|---|---:|---|
| RPM | 6200 | Engine speed |
| Temperature | 165 °C | Thermal condition |
| Oil Pressure | 4.2 bar | Lubrication condition |
| Vibration | 3.1 mm/s | Mechanical condition |
| EGT | 710 °C | Exhaust/combustion indication |
| Fuel Flow | 5.8 L/hr | Fuel behavior |
| Throttle | 72% | Operating command |
| Ambient Temperature | 30 °C | Environmental condition |
| Ambient Pressure/Altitude | variable | Operating context |

The exact values are prototype values and should not be presented as universal limits for a specific certified engine.

---

# 10. Common Telemetry Relationships

The simulator should produce **correlated data**, not random independent numbers.

Example:

```text
Throttle ↑
   ↓
RPM ↑
   ↓
Fuel Flow ↑
   ↓
Temperature ↑
   ↓
EGT ↑
```

Another example:

```text
Oil Pressure ↓
      +
Temperature ↑
      +
Vibration ↑
      ↓
Possible lubrication degradation
```

This correlation is important because it makes the simulated Digital Twin more meaningful.

---

# 11. Engine Simulator

The engine simulator is the foundation of the software-only MVP.

It should produce time-series data such as:

```text
timestamp | rpm | temp | oil_pressure | vibration | egt | fuel_flow | throttle
--------------------------------------------------------------------------
0         | 5200| 130  | 4.5          | 1.8       | 600 | 4.8       | 55
1         | 5300| 132  | 4.5          | 1.9       | 610 | 4.9       | 57
2         | 5500| 137  | 4.4          | 1.9       | 625 | 5.1       | 60
```

The simulator should support:

- Normal operation
- Overheating
- Low oil pressure
- Excessive vibration
- RPM instability
- Combined degradation

---

# 12. Fault Injection

Create software functions such as:

```text
normal()
overheating()
low_oil_pressure()
high_vibration()
rpm_instability()
```

Faults should be introduced gradually where possible.

Example:

```text
Healthy
  ↓
Early degradation
  ↓
Moderate degradation
  ↓
Severe degradation
```

This allows the dashboard to show a meaningful health trend.

---

# 13. Digital Twin Concept

The Digital Twin should estimate expected behavior from operating conditions.

Example:

```text
Inputs
------
RPM
Throttle
Ambient Temperature
Ambient Pressure
Fuel Flow

        ↓

Digital Twin Model

        ↓

Expected State
--------------
Expected Temperature
Expected Oil Pressure
Expected Vibration
Expected EGT
```

Then compare:

```text
Actual Temperature = 171 °C
Expected Temperature = 158 °C

Deviation = +13 °C
```

Repeat this across multiple parameters.

The combined deviations become a useful anomaly signal.

---

# 14. Hybrid Digital Twin Strategy

The recommended Digital Twin is hybrid:

### A. Physics-inspired component

Use understandable relationships and operating limits.

### B. Data-driven component

Use ML to learn normal/abnormal patterns.

### C. State estimation

Combine telemetry and model outputs to estimate health.

This is more defensible than claiming:

> "The AI model itself is the Digital Twin."

---

# 15. AI Pipeline

Use the following progression:

```text
Telemetry
   ↓
Preprocessing
   ↓
Feature Extraction
   ↓
Digital Twin Deviation
   ↓
Anomaly Detection
   ↓
Fault Classification
   ↓
Health Estimation
   ↓
Mission Risk
```

---

# 16. AI Layer 1 — Anomaly Detection

Primary MVP objective:

> Determine whether the engine is behaving abnormally.

Recommended starting algorithm:

### Isolation Forest

Possible output:

```text
Anomaly Score = 0.83
Status = ABNORMAL
```

or:

```text
NORMAL
WARNING
CRITICAL
```

Alternative algorithms for future work:

- One-Class SVM
- Autoencoder
- PCA-based anomaly detection

Do not begin with complex deep learning unless the data and team justify it.

---

# 17. AI Layer 2 — Fault Classification

After detecting an anomaly, determine likely fault type.

Initial classes:

```text
NORMAL
OVERHEATING
LOW_OIL_PRESSURE
EXCESSIVE_VIBRATION
RPM_INSTABILITY
```

Recommended MVP model:

- Random Forest
- XGBoost

The model output can be:

```text
Fault:
OVERHEATING

Probability:
81%
```

---

# 18. Engine Health Index

The MVP can use a transparent weighted health model.

Conceptually:

```text
Health Index =
100
- Temperature Penalty
- Vibration Penalty
- Oil Pressure Penalty
- Digital Twin Deviation Penalty
- Anomaly Penalty
```

Example:

```text
Engine Health = 91%
```

The exact weighting should be documented and validated against your simulated scenarios.

A later version can replace or refine this with an ML-based health estimator.

---

# 19. Mission Reliability Assessment

This is a major differentiator.

Traditional monitoring might stop at:

> Fault detected.

AeroTwin-AI should continue:

```text
Fault detected
      ↓
Engine health reduced
      ↓
Estimated operational capability
      ↓
Compare against mission requirement
      ↓
Mission risk
```

Example:

```text
Mission duration = 5 hours
Estimated safe operating capability = 6.3 hours

Mission Risk = LOW
```

Another scenario:

```text
Mission duration = 5 hours
Estimated safe operating capability = 2.8 hours

Mission Risk = HIGH
```

The system can output:

```text
LOW RISK
MEDIUM RISK
HIGH RISK
```

and a recommendation such as:

```text
GO
CAUTION
RETURN / INSPECT
```

These are prototype decision-support outputs, not aviation certification decisions.

---

# 20. RUL — Remaining Useful Life

RUL is valuable but should be treated as a Phase 2 feature unless sufficient degradation data is available.

Desired future output:

```text
Engine Health: 76%
Degradation: Rapid
Estimated RUL: 18 operating hours
Risk: HIGH
```

Important:

Do not claim that a RUL value trained only on synthetic data is a real-world certified prediction.

Use wording such as:

> "Model-estimated RUL under the prototype's simulated operating assumptions."

---

# 21. Explainable AI

A future improvement is to show why the AI reached a conclusion.

Example:

```text
Fault: Lubrication degradation

Contributing factors:

Oil Pressure       ████████████  42%
Oil Temperature    ████████      27%
Vibration          ██████        21%
RPM Deviation      ███           10%
```

SHAP or similar methods can later be used for explainability.

This is valuable because engineering users need more than a black-box probability.

---

# 22. Dashboard Design

The dashboard should look like an engineering monitoring platform.

Suggested layout:

```text
┌─────────────────────────────────────────────┐
│             AEROTWIN-AI                     │
│       UAV ENGINE DIGITAL TWIN               │
├─────────┬─────────┬─────────┬───────────────┤
│ RPM     │ TEMP    │ OIL P   │ VIBRATION     │
│ 6200    │ 165°C   │ 4.2 bar │ 3.1 mm/s     │
├─────────┴─────────┴─────────┴───────────────┤
│                                             │
│           ENGINE HEALTH                     │
│              91%                            │
│                                             │
├──────────────────────┬──────────────────────┤
│ Actual vs Twin       │ AI Prediction        │
│                      │                      │
│ [graph]              │ Fault: None          │
│                      │ Probability: 8%      │
├──────────────────────┴──────────────────────┤
│             MISSION STATUS                  │
│                LOW RISK                     │
└─────────────────────────────────────────────┘
```

---

# 23. Recommended Dashboard Components

### Telemetry cards

- RPM
- Temperature
- Oil Pressure
- Vibration
- EGT
- Fuel Flow

### Health

- Health percentage
- Health trend
- Current condition

### Digital Twin

- Actual vs expected
- Deviation score

### AI

- Anomaly score
- Fault type
- Fault probability

### Mission

- Mission duration
- Estimated capability
- Mission risk
- Recommendation

### History

- Telemetry trend
- Health trend
- Fault history

---

# 24. Critical Demo Scenario

The strongest demonstration should show a healthy engine progressively degrading.

### Stage 1 — Healthy

```text
Health = 96%
Mission Risk = LOW
Fault = NONE
```

### Stage 2 — Early degradation

Vibration starts increasing.

```text
Health = 92%
Mission Risk = LOW
Anomaly = WARNING
```

### Stage 3 — Abnormal behavior

Temperature begins increasing beyond expected twin behavior.

```text
Health = 84%
Anomaly = HIGH
```

### Stage 4 — Fault prediction

```text
Possible Fault = OVERHEATING
Probability = 81%
```

### Stage 5 — Mission impact

```text
Health = 68%
Mission Risk = HIGH
Recommendation = RETURN / INSPECT
```

This single scenario communicates the entire project.

---

# 25. Team Structure

## Saad — Product / Research Lead

Primary responsibility:

**What are we building and why?**

Responsibilities:

- Problem definition
- Existing-system analysis
- User identification
- Requirements
- Objectives
- Novelty
- Literature/research
- SIH documentation
- Pitch narrative
- Problem-impact analysis

### Deliverables

- Problem statement analysis
- Existing limitations
- Target users
- Objectives
- Novelty
- Expected impact
- Presentation narrative

---

## Tripti — System / Validation Lead

Primary responsibility:

**How does the system work and how do we prove it?**

Responsibilities:

- System architecture
- Digital Twin explanation
- AI pipeline documentation
- Mission reliability logic
- Validation methodology
- Test scenarios
- KPIs
- Demo scenario
- Q&A preparation
- Technical presentation

### Deliverables

- Architecture diagram
- Data-flow diagram
- AI pipeline
- Validation plan
- Testing scenarios
- Performance metrics
- Technical presentation

---

## Manjeet — Backend / Data Lead

Primary responsibility:

**Data pipeline and backend infrastructure.**

Responsibilities:

- FastAPI setup
- API design
- Data schema
- Data ingestion
- Data processing
- Database
- Digital Twin backend integration
- AI integration
- Frontend API interface

### Suggested APIs

```text
GET /telemetry
GET /engine/state
GET /digital-twin
GET /health
GET /anomaly
GET /fault
GET /mission-risk
```

---

## Aryan — AI / Digital Twin Lead

Primary responsibility:

**Engine simulation and intelligence.**

Responsibilities:

- Engine simulator
- Synthetic telemetry
- Fault injection
- Digital Twin model
- Feature engineering
- Anomaly detection
- Fault classification
- Health model
- Mission risk logic
- Later RUL

### Development order

```text
Engine Simulator
      ↓
Normal Behavior
      ↓
Fault Injection
      ↓
Anomaly Detection
      ↓
Fault Classification
      ↓
Health Score
      ↓
Mission Risk
```

---

## Netra — Frontend / UI Lead

Primary responsibility:

**Application architecture and dashboard.**

Responsibilities:

- Frontend setup
- Dashboard architecture
- Navigation
- Layout
- State management
- API integration
- Health display
- Digital Twin display

---

## Anmol — Frontend / Visualization & Integration Lead

Primary responsibility:

**Visualization and frontend polish.**

Responsibilities:

- Charts
- Telemetry cards
- Health gauge
- Fault visualization
- Mission risk visualization
- Actual vs expected charts
- Frontend/backend integration
- Demo UI polish

---

# 26. Team Responsibility Matrix

| Task | Saad | Tripti | Manjeet | Aryan | Netra | Anmol |
|---|---:|---:|---:|---:|---:|---:|
| Problem definition | Lead | Support | | | | |
| Research | Lead | Lead | | | | |
| Requirements | Lead | Lead | Support | Support | | |
| Architecture | Support | Lead | Lead | Lead | Support | Support |
| Engine simulation | | Support | | Lead | | |
| Digital Twin | | Lead | Support | Lead | | |
| AI | | Support | Support | Lead | | |
| Backend | | | Lead | Lead support | | |
| Database | | | Lead | Support | | |
| Frontend | | | | | Lead | Lead |
| Visualization | | | | | Lead | Lead |
| Testing | Lead | Lead | Support | Lead | Support | Support |
| Documentation | Lead | Lead | Support | Support | Support | Support |
| Presentation | Lead | Lead | Support | Support | Support | Support |
| Demo | Support | Lead | Lead | Lead | Lead | Lead |

---

# 27. 10-Day Development Plan

## DAY 1 — Freeze the MVP

### Everyone

Agree on exactly six core features:

1. Telemetry simulation
2. Digital Twin
3. Actual vs expected state
4. Anomaly detection
5. Health score
6. Dashboard

Fault classification and mission risk should be added immediately after the core pipeline works.

### Saad + Tripti

Create:

- Problem
- Current limitations
- Proposed solution
- Target users
- Objectives
- Fault scenarios

### Manjeet + Aryan

Define telemetry schema:

```json
{
  "timestamp": "...",
  "rpm": 6200,
  "temperature": 165,
  "oil_pressure": 4.2,
  "vibration": 3.1,
  "egt": 710,
  "fuel_flow": 5.8,
  "throttle": 72
}
```

### Netra + Anmol

Create dashboard wireframe.

---

# 28. DAY 2 — Engine Simulator

### Aryan

Build:

- Normal operation
- Overheating
- Low oil pressure
- High vibration
- RPM instability

The simulator must generate correlated time-series telemetry.

### Manjeet

Set up:

- FastAPI
- Data models
- Basic data ingestion
- SQLite

### Netra + Anmol

Build frontend skeleton:

- Header
- Navigation
- Telemetry cards
- Graph placeholders
- Health section
- Fault section
- Mission section

### Saad + Tripti

Research:

- Digital Twin definition
- Predictive maintenance
- Engine health monitoring
- Relevant engine fault modes
- Existing limitations

---

# 29. DAY 3 — Digital Twin

### Aryan + Manjeet

Build:

```text
Inputs
   ↓
Expected engine behavior
   ↓
Expected state
```

Calculate:

```text
Deviation = Actual - Expected
```

Create a combined:

```text
Twin Deviation Score
```

### Frontend

Display:

- Actual value
- Expected value
- Difference

### Presentation team

Create:

- Architecture diagram
- Digital Twin explanation

---

# 30. DAY 4 — Anomaly Detection

### Aryan

Implement Isolation Forest.

Inputs:

- RPM
- Temperature
- Oil Pressure
- Vibration
- EGT
- Fuel Flow
- Digital Twin deviation

Output:

```text
Anomaly Score
Status
```

### Manjeet

Expose AI output through API.

### Frontend

Display anomaly state.

---

# 31. DAY 5 — Fault Classification + Health

### Aryan

Implement Random Forest or XGBoost for initial fault classification.

Classes:

```text
NORMAL
OVERHEATING
LOW_OIL_PRESSURE
EXCESSIVE_VIBRATION
RPM_INSTABILITY
```

Build Health Index.

### Manjeet

Integrate model into backend.

### Frontend

Display:

- Fault
- Probability
- Health
- Health trend

---

# 32. DAY 6 — Mission Reliability

### Aryan + Tripti

Implement simple mission-risk logic.

Inputs:

```text
Engine Health
Fault Probability
Degradation State
Mission Duration
Estimated Operating Capability
```

Output:

```text
LOW
MEDIUM
HIGH
```

Recommendation:

```text
GO
CAUTION
RETURN / INSPECT
```

### Manjeet

Add API:

```text
GET /mission-risk
```

---

# 33. DAY 7 — Full Integration

End-to-end pipeline:

```text
Simulator
   ↓
Backend
   ↓
Digital Twin
   ↓
AI
   ↓
Mission Model
   ↓
API
   ↓
Frontend
```

Goal:

> Working but possibly ugly MVP.

Do not spend this day polishing colors or animations.

---

# 34. DAY 8 — UI + Demo Polish

### Netra + Anmol

Add:

- Real-time charts
- Health gauge
- Fault panel
- Mission risk panel
- Actual vs expected visualization
- Alerts
- Clear status indicators

### Aryan

Prepare deterministic demo scenarios.

### Manjeet

Improve API reliability and error handling.

---

# 35. DAY 9 — Validation + Presentation

### Saad

Prepare:

- Problem
- Existing limitation
- Solution
- Vision
- Impact
- Novelty

### Tripti

Prepare:

- Architecture
- Digital Twin
- AI
- Results
- Validation
- Future scope
- Q&A

### Everyone

Perform full demo rehearsal.

---

# 36. DAY 10 — Freeze

No new features.

Only:

- Bug fixes
- Testing
- Presentation rehearsal
- Demo rehearsal
- Screenshots
- Backup demo video
- Documentation
- Q&A preparation

Create a backup:

```text
LIVE DEMO
+
RECORDED DEMO
+
STATIC SCREENSHOTS
```

Never depend on one live system during the presentation.

---

# 37. Repository Structure

Create the repository immediately.

```text
aerotwin-ai/
│
├── README.md
│
├── backend/
│   ├── main.py
│   ├── api/
│   │   ├── telemetry.py
│   │   ├── health.py
│   │   ├── prediction.py
│   │   └── mission.py
│   │
│   ├── digital_twin/
│   │   ├── model.py
│   │   └── state_estimator.py
│   │
│   ├── ai/
│   │   ├── anomaly.py
│   │   ├── classifier.py
│   │   └── health.py
│   │
│   ├── simulator/
│   │   ├── engine.py
│   │   └── faults.py
│   │
│   └── database/
│       └── database.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── charts/
│   │   └── services/
│   │
│   └── package.json
│
├── data/
│   ├── normal/
│   └── faults/
│
├── models/
│   ├── anomaly_model.pkl
│   └── fault_model.pkl
│
├── docs/
│   ├── architecture/
│   ├── requirements/
│   └── presentation/
│
└── tests/
```

---

# 38. Git Strategy

Branches:

```text
main
│
├── feature/backend-api
├── feature/ai-model
├── feature/dashboard
├── feature/charts
├── docs/problem-definition
└── docs/architecture
```

Suggested ownership:

| Person | Branch |
|---|---|
| Saad | docs/problem-definition |
| Tripti | docs/architecture |
| Manjeet | feature/backend-api |
| Aryan | feature/ai-model |
| Netra | feature/dashboard |
| Anmol | feature/charts |

Rules:

- Do not directly break `main`
- Commit frequently
- Pull before starting work
- Merge small changes
- Use meaningful commit messages
- Keep shared data schema synchronized

---

# 39. Data Strategy

The biggest technical risk is data availability.

The MVP should use a combination of:

### 1. Synthetic data

Generated by the engine simulator.

### 2. Public datasets

Where relevant and legally/technically appropriate.

### 3. Experimental data

Only if the institution has appropriate access.

### 4. Fault injection

Controlled deviations added to normal telemetry.

Do not claim that synthetic data alone proves real aircraft-engine performance.

Recommended presentation wording:

> "The MVP validates the software architecture and AI pipeline using simulated and available engine telemetry. Future versions will be calibrated and validated using engine-specific operational data."

---

# 40. Evaluation Metrics

## Anomaly detection

- Precision
- Recall
- F1-score
- False alarm rate

## Fault classification

- Accuracy
- Precision
- Recall
- F1-score
- Confusion matrix

## Digital Twin

Compare:

```text
Actual vs Expected
```

Metrics:

- MAE
- RMSE
- Percentage error

## Health Index

Evaluate whether health decreases consistently with injected degradation.

## Mission Risk

Evaluate whether increasing degradation produces an appropriate transition:

```text
LOW → MEDIUM → HIGH
```

## System

Measure:

- Processing latency
- Prediction latency
- Data throughput
- API response time

---

# 41. What Makes This Different From a Normal IoT Dashboard?

A normal monitoring system:

```text
Sensor
  ↓
Threshold
  ↓
Alarm
```

AeroTwin-AI:

```text
Telemetry
  ↓
Digital Twin
  ↓
Actual vs Expected
  ↓
AI
  ↓
Anomaly Detection
  ↓
Fault Prediction
  ↓
Health Index
  ↓
Mission Reliability
  ↓
Decision Support
```

This is the core differentiation.

---

# 42. What Makes the Digital Twin Important?

A simple threshold system might say:

```text
Temperature > 180°C
     ↓
ALARM
```

The Digital Twin approach can identify:

```text
Expected Temperature = 150°C
Actual Temperature = 165°C
     ↓
Deviation = +10%
     ↓
Abnormal behavior
```

Even if the absolute value has not yet crossed a hard threshold, the system can identify a behavioral change.

This is an important conceptual advantage.

---

# 43. What NOT to Claim

Avoid statements such as:

> "Our system guarantees engine safety."

> "Our AI can perfectly predict aircraft engine failure."

> "Our Digital Twin is a complete certified aircraft engine model."

> "Our synthetic dataset proves real-world aviation accuracy."

> "Our RUL prediction is operationally certified."

Instead say:

> "This is a software prototype demonstrating the proposed architecture."

> "The system is designed for calibration and validation against engine-specific operational data."

> "The output is intended as engineering decision support."

---

# 44. SIH Presentation Narrative

The presentation should tell one story rather than becoming a list of technologies.

## Slide 1 — Problem

Engine degradation can occur before conventional threshold-based alerts become useful.

## Slide 2 — Mission Impact

Engine health is directly related to UAV mission reliability.

## Slide 3 — Proposed Solution

AI-enabled Digital Twin.

## Slide 4 — Architecture

```text
Telemetry
 ↓
Digital Twin
 ↓
AI
 ↓
Health
 ↓
Mission Risk
```

## Slide 5 — MVP

Show the actual software.

## Slide 6 — Healthy Engine

```text
Health = 96%
Risk = LOW
```

## Slide 7 — Fault Injection

Introduce progressive degradation.

## Slide 8 — AI Detection

```text
Fault = OVERHEATING
Probability = 81%
```

## Slide 9 — Mission Impact

```text
Risk = HIGH
Recommendation = RETURN / INSPECT
```

## Slide 10 — Vision

```text
Simulation
    ↓
Real engine datasets
    ↓
Engine-specific Digital Twin
    ↓
Operational UAV telemetry
    ↓
Fleet-level predictive maintenance
```

---

# 45. Three-Minute Demo Script

```text
00:00 — Introduce the problem

00:30 — Explain the architecture

01:00 — Show healthy engine

01:30 — Inject fault

02:00 — Show Digital Twin deviation

02:20 — Show AI fault prediction

02:40 — Show health degradation

02:50 — Show mission risk change

03:00 — State vision and impact
```

The demo should be rehearsed until every transition is predictable.

---

# 46. Future Roadmap

## Phase 1 — Current MVP

```text
Synthetic telemetry
       ↓
Digital Twin
       ↓
AI
       ↓
Health + Fault
       ↓
Mission Risk
```

## Phase 2

```text
Engine-specific datasets
       ↓
Calibrated Digital Twin
       ↓
Improved ML
       ↓
RUL
       ↓
Explainable AI
```

## Phase 3

```text
Real-time UAV telemetry
       ↓
Edge processing
       ↓
Continuous Digital Twin
       ↓
Operational decision support
```

## Phase 4

```text
Multiple UAVs
       ↓
Fleet monitoring
       ↓
Predictive maintenance planning
       ↓
Fleet reliability optimization
```

---

# 47. Vision Statement

> **To create an intelligent, continuously updated digital representation of an aero piston engine that understands its current health, detects abnormal behavior, predicts emerging faults, estimates degradation, and translates engine condition into mission-level reliability information for MALE UAV operations.**

Short version:

> **From "Is the engine abnormal?" to "What is happening, why is it happening, how serious is it, and can the mission still be completed safely?"**

---

# 48. Strategic Development Principles

## Principle 1 — End-to-end beats complexity

A complete simple pipeline is better than five sophisticated disconnected models.

## Principle 2 — Digital Twin first, AI second

AI should augment the Digital Twin, not replace the concept.

## Principle 3 — Demonstrability matters

Every major feature should be demonstrable during the presentation.

## Principle 4 — Validate what you claim

Do not claim real-world aviation performance without real-world validation.

## Principle 5 — Keep the MVP deterministic

The presentation demo should produce predictable results.

## Principle 6 — Build in parallel

Backend, frontend, AI, research, and documentation should progress simultaneously.

## Principle 7 — Freeze the scope

After Day 7, no major feature additions.

---

# 49. Immediate Team Checklist

## Saad

- [ ] Finalize problem description
- [ ] Research current limitations
- [ ] Define target users
- [ ] Define objectives
- [ ] Define novelty
- [ ] Start presentation narrative

## Tripti

- [ ] Finalize system architecture
- [ ] Define Digital Twin concept
- [ ] Define mission reliability model
- [ ] Define validation plan
- [ ] Prepare Q&A topics

## Manjeet

- [ ] Create repository/backend
- [ ] Define API contract
- [ ] Set up FastAPI
- [ ] Set up SQLite
- [ ] Integrate simulator
- [ ] Integrate AI outputs

## Aryan

- [ ] Build engine simulator
- [ ] Build fault injection
- [ ] Build Digital Twin
- [ ] Build anomaly detection
- [ ] Build fault classifier
- [ ] Build health model
- [ ] Build mission-risk logic

## Netra

- [ ] Create frontend
- [ ] Build dashboard layout
- [ ] Build navigation
- [ ] Build health visualization
- [ ] Integrate API

## Anmol

- [ ] Build telemetry charts
- [ ] Build actual-vs-twin charts
- [ ] Build fault visualization
- [ ] Build mission-risk visualization
- [ ] Polish dashboard
- [ ] Support final integration

---

# 50. Final Definition of Done for the 10-Day MVP

The MVP is considered complete when:

- [ ] Engine telemetry can be generated
- [ ] Normal and fault scenarios exist
- [ ] Digital Twin generates expected values
- [ ] Actual vs expected values are visible
- [ ] Anomaly detection works
- [ ] At least 3–4 fault types can be classified
- [ ] Health Index changes with degradation
- [ ] Mission Risk changes with engine condition
- [ ] Backend exposes the outputs
- [ ] Frontend displays the outputs
- [ ] One complete fault scenario can be demonstrated live
- [ ] Results can be explained
- [ ] Limitations are documented
- [ ] Future scope is documented
- [ ] Backup demo exists
- [ ] Presentation is rehearsed

---

# 51. Final Strategic Positioning

The project should be positioned as:

> **A software-first predictive engine-health and mission-reliability platform using a hybrid Digital Twin and AI approach.**

The strongest conceptual chain is:

```text
                 OBSERVE
                    ↓
               Telemetry
                    ↓
                 MODEL
                    ↓
             Digital Twin
                    ↓
                COMPARE
                    ↓
          Actual vs Expected
                    ↓
                UNDERSTAND
                    ↓
                   AI
                    ↓
                PREDICT
                    ↓
        Fault + Health + Degradation
                    ↓
                ASSESS
                    ↓
             Mission Risk
                    ↓
                INFORM
                    ↓
             Human Operator
```

This is the central architecture and story of AeroTwin-AI.

---

# 52. One-Sentence Project Definition

> **AeroTwin-AI is a software-based AI-enabled Digital Twin platform that continuously models aero piston engine behavior, detects deviations and emerging faults, estimates engine health, and translates predicted engine degradation into mission-level reliability insights for MALE UAV operations.**

---

# 53. One-Sentence SIH Pitch

> **"Instead of waiting for an aero engine fault to become a mission failure, AeroTwin-AI continuously learns and compares engine behavior, predicts degradation, and tells the operator how that degradation could affect mission reliability."**

---

# 54. Important MVP Boundary

The first 10 days are about **proving the concept**, not finishing the final system.

The team should prioritize:

```text
WORKING PIPELINE
      >
ADVANCED FEATURES
```

and:

```text
CREDIBLE VALIDATION
      >
UNSUPPORTED CLAIMS
```

and:

```text
DEMONSTRABLE MVP
      >
OVERENGINEERED ARCHITECTURE
```

The first presentation should establish that the team has a technically coherent foundation from which a much more advanced engine-specific Digital Twin can be developed.
