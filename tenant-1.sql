-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost
-- Tiempo de generación: 10-02-2026 a las 16:02:10
-- Versión del servidor: 8.0.30
-- Versión de PHP: 8.3.10

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `tenant-1`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_period`
--

CREATE TABLE `academic_period` (
  `id` bigint NOT NULL,
  `period` varchar(100) NOT NULL,
  `date_initial_period_academic_system` datetime DEFAULT NULL,
  `date_final_period_academic_system` datetime DEFAULT NULL,
  `date_initial_start_academic_practice` datetime DEFAULT NULL,
  `date_final_start_academic_practice` datetime DEFAULT NULL,
  `date_max_end_practice` datetime DEFAULT NULL,
  `date_initial_approbation_practice` datetime DEFAULT NULL,
  `date_final_approbation_practice` datetime DEFAULT NULL,
  `date_initial_legalization_practice` datetime DEFAULT NULL,
  `date_final_legalization_practice` datetime DEFAULT NULL,
  `date_initial_publish_offer` datetime DEFAULT NULL,
  `date_initial_publish_sw` datetime DEFAULT NULL,
  `date_final_publish_sw` datetime DEFAULT NULL,
  `date_final_publish_offer` datetime DEFAULT NULL,
  `status` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_practice`
--

CREATE TABLE `academic_practice` (
  `academic_practice_id` bigint NOT NULL,
  `ordinary_weekly_session` int DEFAULT NULL,
  `dedication` bigint NOT NULL,
  `dedication_hours` float DEFAULT NULL,
  `period` bigint NOT NULL,
  `contract_type` bigint DEFAULT NULL,
  `is_paid` bit(1) DEFAULT b'0',
  `salary_range_min` int DEFAULT NULL,
  `salary_range_max` int DEFAULT NULL,
  `salary_range_is_confidentiality` bit(1) DEFAULT b'0',
  `company_name_is_confidentiality` bit(1) DEFAULT b'0',
  `country` bigint DEFAULT NULL,
  `arl` int DEFAULT NULL,
  `is_psychology` bit(1) DEFAULT b'0',
  `psychologist_in_charge` varchar(150) DEFAULT NULL,
  `job_area` bigint DEFAULT NULL,
  `required_document` bigint DEFAULT NULL,
  `is_doc_required` tinyint(1) DEFAULT '0',
  `required_document_2` bigint DEFAULT NULL,
  `required_document_3` bigint DEFAULT NULL,
  `extra_info_url` varchar(500) DEFAULT NULL,
  `date_start_practice` date DEFAULT NULL,
  `date_end_practice` date DEFAULT NULL,
  `cumulative_average` float DEFAULT '0',
  `min_horary` varchar(10) DEFAULT '',
  `max_horary` varchar(10) DEFAULT '',
  `horary_text` varchar(256) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_practice_legalized`
--

CREATE TABLE `academic_practice_legalized` (
  `academic_practice_legalized_id` bigint NOT NULL,
  `uuid` varchar(40) NOT NULL DEFAULT '',
  `academic_practice_id` bigint DEFAULT NULL,
  `date_creation` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `date_updater` timestamp NULL DEFAULT NULL,
  `status_apl` varchar(20) NOT NULL DEFAULT 'POSTULANT_REVIEW',
  `practice_type` bigint DEFAULT NULL,
  `practice_type_authorization` bigint DEFAULT NULL,
  `date_start_practice` date DEFAULT NULL,
  `date_end_practice` date DEFAULT NULL,
  `postulant_apl` bigint NOT NULL,
  `company_apl` bigint NOT NULL,
  `boss_apl` bigint DEFAULT NULL,
  `program_apl` bigint NOT NULL,
  `contract_type_apl` bigint DEFAULT NULL,
  `dedication_hour_week_apl` bigint DEFAULT NULL,
  `country_apl` bigint DEFAULT NULL,
  `city_apl` bigint DEFAULT NULL,
  `function` bigint DEFAULT NULL,
  `other_function_apl` text,
  `obtain_practice` bigint DEFAULT NULL,
  `is_paid_apl` bit(1) DEFAULT NULL,
  `practice_risk` tinyint(1) DEFAULT '0',
  `salary_month` decimal(11,0) DEFAULT NULL,
  `self_managed` tinyint(1) NOT NULL DEFAULT '0',
  `user_tutor` bigint DEFAULT NULL,
  `faculty_apl` int DEFAULT NULL,
  `ssc_apl` float DEFAULT NULL,
  `user_tutor_2` bigint DEFAULT NULL,
  `is_university_arl` tinyint(1) DEFAULT NULL,
  `day_number` int DEFAULT NULL,
  `duration` varchar(100) DEFAULT NULL,
  `area` varchar(150) DEFAULT NULL,
  `arl` bigint DEFAULT NULL,
  `journey` varchar(256) DEFAULT NULL,
  `required_review_coordinator` tinyint(1) DEFAULT '0',
  `approved_coordinator` tinyint(1) DEFAULT '0',
  `phone_number_office` decimal(9,0) DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `academic_period_apl` bigint DEFAULT NULL,
  `date_approval_apl` timestamp NULL DEFAULT NULL,
  `first_evaluation_date` date DEFAULT NULL,
  `second_evaluation_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_practice_opportunity_language`
--

CREATE TABLE `academic_practice_opportunity_language` (
  `academic_practice_id` bigint NOT NULL,
  `opportunity_language_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_practice_student`
--

CREATE TABLE `academic_practice_student` (
  `id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL DEFAULT '1',
  `student_id` bigint NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `status_id` bigint DEFAULT NULL,
  `period_id` bigint DEFAULT NULL,
  `practice_id` bigint DEFAULT NULL,
  `parametric_message_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academic_rules`
--

CREATE TABLE `academic_rules` (
  `id` bigint NOT NULL,
  `academic_var` bigint NOT NULL,
  `operator` bigint NOT NULL,
  `value` varchar(100) NOT NULL,
  `conector` bigint NOT NULL,
  `type_practice` bigint NOT NULL,
  `program_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `access_opportunity_administrator`
--

CREATE TABLE `access_opportunity_administrator` (
  `access_opportunity_administrator_id` bigint NOT NULL,
  `status_opportunity` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `access_opportunity_postulant`
--

CREATE TABLE `access_opportunity_postulant` (
  `access_opportunity_postulant_id` bigint NOT NULL,
  `required_degree_programs` bit(1) DEFAULT b'0',
  `required_registered_programs` bit(1) DEFAULT b'0',
  `degree_candidate` bit(1) DEFAULT b'0',
  `has_authorized_list` bit(1) DEFAULT b'0',
  `initial_filter` bit(1) DEFAULT b'0',
  `level_postulant` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `access_opportunity_type`
--

CREATE TABLE `access_opportunity_type` (
  `id` bigint NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `user_type` varchar(100) DEFAULT NULL,
  `level_opportunity` varchar(100) DEFAULT NULL,
  `only_own_programs` bit(1) DEFAULT b'0',
  `opportunity_type` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `access_postulant_practice`
--

CREATE TABLE `access_postulant_practice` (
  `id` bigint NOT NULL,
  `name` varchar(150) NOT NULL,
  `period_id` bigint NOT NULL,
  `faculty_id` int NOT NULL,
  `rules` text NOT NULL,
  `status` varchar(20) NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `access_postulant_practice_program`
--

CREATE TABLE `access_postulant_practice_program` (
  `access_postulant_practice_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `activities_logs`
--

CREATE TABLE `activities_logs` (
  `activity_log_id` bigint NOT NULL,
  `uuid` varchar(40) NOT NULL DEFAULT '',
  `tracing_practice_id` bigint NOT NULL,
  `monitoring_activity_id` bigint NOT NULL,
  `practice_plan_id` bigint DEFAULT NULL,
  `tracking_schedule_id` bigint DEFAULT NULL,
  `first_attachment` bigint DEFAULT NULL,
  `second_attachment` bigint DEFAULT NULL,
  `activity_start_date` timestamp NULL DEFAULT NULL,
  `activity_end_date` timestamp NULL DEFAULT NULL,
  `advantage_percentage_activity` decimal(3,2) NOT NULL,
  `complete_activity` tinyint(1) NOT NULL,
  `note_activity` float(3,2) DEFAULT NULL,
  `link_activity` varchar(100) DEFAULT NULL,
  `observation_activity` text,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `log_date_activity` timestamp NULL DEFAULT NULL,
  `day_count` smallint DEFAULT '0',
  `hour_count` smallint DEFAULT '0',
  `minute_count` smallint DEFAULT '0',
  `time_count` timestamp NULL DEFAULT NULL,
  `total_hour_count` smallint DEFAULT '0',
  `total_minute_count` float DEFAULT '0',
  `total_approved_hour_count` smallint DEFAULT '0',
  `total_approved_minute_count` float DEFAULT '0',
  `compensation_start_date` timestamp NULL DEFAULT NULL,
  `compensation_end_date` timestamp NULL DEFAULT NULL,
  `total_compensation_hour_count` smallint DEFAULT '0',
  `total_compensation_minute_count` float DEFAULT '0',
  `location` varchar(250) DEFAULT '',
  `activity` text,
  `arl_report` tinyint(1) DEFAULT '0',
  `reporting_medium` bigint DEFAULT NULL,
  `arl_report_date` date DEFAULT NULL,
  `got_attention` tinyint(1) DEFAULT '0',
  `health_entity` varchar(250) DEFAULT '',
  `has_inability` tinyint(1) DEFAULT '0',
  `inability_days` smallint DEFAULT '0',
  `next_attention` varchar(250) DEFAULT '',
  `attention_pqr` text,
  `arl_investigation` tinyint(1) DEFAULT '0',
  `actions` text,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `status` varchar(40) DEFAULT 'PENDING_REVIEW_ACTIVITY_LOG',
  `date_approved_activity` timestamp NULL DEFAULT NULL,
  `user_approved_activity` varchar(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `alert_configuration`
--

CREATE TABLE `alert_configuration` (
  `id` bigint NOT NULL,
  `alert` varchar(50) NOT NULL,
  `value` smallint NOT NULL DEFAULT '0',
  `unit` varchar(10) NOT NULL,
  `status` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `allowed_extensions`
--

CREATE TABLE `allowed_extensions` (
  `document_practice_definition_id` bigint NOT NULL,
  `item_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `application_info_transnational`
--

CREATE TABLE `application_info_transnational` (
  `id` bigint NOT NULL,
  `application_id` bigint NOT NULL,
  `duration_month` int NOT NULL,
  `country_id` bigint NOT NULL,
  `city_id` bigint NOT NULL,
  `currency` bigint NOT NULL,
  `salary_range_min` varchar(15) NOT NULL,
  `salary_range_max` varchar(15) NOT NULL,
  `extra_hours` bit(1) NOT NULL DEFAULT b'0',
  `percentage_vacation` varchar(4) DEFAULT NULL,
  `percentage_extra_pay` varchar(4) DEFAULT NULL,
  `percentage_guarantee_funds` varchar(4) DEFAULT NULL,
  `percentage_insurance_policies` varchar(4) DEFAULT NULL,
  `name_other` varchar(255) DEFAULT NULL,
  `percentage_other` varchar(4) DEFAULT NULL,
  `social` varchar(1024) DEFAULT NULL,
  `min_horary` varchar(10) NOT NULL,
  `max_horary` varchar(10) NOT NULL,
  `benefits` varchar(1024) DEFAULT NULL,
  `address` varchar(256) NOT NULL,
  `international_passport` varchar(50) DEFAULT NULL,
  `visa` varchar(50) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `approval_documents`
--

CREATE TABLE `approval_documents` (
  `approval_document_id` bigint NOT NULL,
  `document_practice_definition_id` bigint NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `user_ip` varchar(50) DEFAULT NULL,
  `approval_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_document_status_before` varchar(20) DEFAULT NULL,
  `approval_document_status_after` varchar(20) NOT NULL DEFAULT 'PENDING_APPROVAL',
  `approval_observation` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `approval_monitoring_documents`
--

CREATE TABLE `approval_monitoring_documents` (
  `approval_document_id` bigint NOT NULL,
  `document_monitoring_definition_id` bigint NOT NULL,
  `monitoring_legalized_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `user_ip` varchar(50) DEFAULT NULL,
  `approval_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_document_status_before` varchar(20) DEFAULT NULL,
  `approval_document_status_after` varchar(20) NOT NULL DEFAULT 'PENDING_APPROVAL',
  `approval_observation` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `approval_program_academic_practice`
--

CREATE TABLE `approval_program_academic_practice` (
  `id` bigint NOT NULL,
  `program_id` bigint NOT NULL DEFAULT '0',
  `academic_practice_id` bigint NOT NULL DEFAULT '0',
  `status` varchar(30) NOT NULL DEFAULT '0',
  `user_creator` varchar(200) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_updater` varchar(200) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Registra las aprobaciones de los programas asociados a una práctica académica';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `attachment`
--

CREATE TABLE `attachment` (
  `id` bigint NOT NULL,
  `name` varchar(250) NOT NULL DEFAULT '',
  `content_type` varchar(150) NOT NULL,
  `filepath` varchar(300) NOT NULL DEFAULT '',
  `status` varchar(100) NOT NULL,
  `downloaded` bit(1) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `authorized_study_working`
--

CREATE TABLE `authorized_study_working` (
  `id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_creation` datetime NOT NULL,
  `status` varchar(2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `authorized_study_working_log`
--

CREATE TABLE `authorized_study_working_log` (
  `id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_creation` datetime NOT NULL,
  `status` varchar(2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 ROW_FORMAT=DYNAMIC;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `branch`
--

CREATE TABLE `branch` (
  `branch_id` bigint NOT NULL COMMENT 'identificador unico de la tabla',
  `code` varchar(25) DEFAULT NULL COMMENT 'código de identificación para las sedes, usado para consultar los parámetros  de autenticación',
  `name` varchar(250) NOT NULL COMMENT 'Nombre de la sede',
  `country` bigint DEFAULT NULL,
  `city` bigint DEFAULT NULL,
  `address` varchar(250) DEFAULT NULL,
  `active_directory` bigint DEFAULT NULL,
  `parameter_directory` varchar(500) DEFAULT NULL,
  `date_creation` datetime NOT NULL COMMENT 'Fecha de creación',
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `status` varchar(10) NOT NULL COMMENT 'Estado de la sede'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Almacena todas las sedes que eso sistema maneja sin importar la empresa.';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `bulk_load`
--

CREATE TABLE `bulk_load` (
  `id` bigint NOT NULL,
  `user` varchar(50) DEFAULT NULL,
  `academic_id` bigint DEFAULT NULL,
  `academic_code` bigint DEFAULT NULL,
  `identification_type` varchar(100) DEFAULT NULL,
  `identification` varchar(150) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `lastname` varchar(100) DEFAULT NULL,
  `gender` varchar(1) DEFAULT NULL,
  `credit_semester` float DEFAULT NULL,
  `enrolled_program` varchar(1000) DEFAULT NULL,
  `graduate_program` varchar(1000) DEFAULT NULL,
  `currently_enrolled` varchar(45) DEFAULT NULL,
  `cumulative_avg` float DEFAULT NULL,
  `all_approved_courses` varchar(1000) DEFAULT NULL,
  `all_current_courses` varchar(1000) DEFAULT NULL,
  `period_disc_suspension` varchar(20) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `date_birth` varchar(15) DEFAULT NULL,
  `country_birth_id` varchar(100) DEFAULT NULL,
  `state_birth_id` varchar(100) DEFAULT NULL,
  `city_birth_id` varchar(100) DEFAULT NULL,
  `bulk_loaded_row` varchar(1000) DEFAULT NULL,
  `date_creation` datetime DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `personal_web` varchar(1000) DEFAULT NULL,
  `address` varchar(100) DEFAULT NULL,
  `company_name` varchar(1000) DEFAULT NULL,
  `company_sector` varchar(1000) DEFAULT NULL,
  `user_alternative` varchar(30) DEFAULT NULL,
  `web_site_company` varchar(100) DEFAULT NULL,
  `movil` varchar(20) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `mail_alternative` varchar(100) DEFAULT NULL,
  `linked_in_link` varchar(1000) DEFAULT NULL,
  `country_residence` varchar(100) DEFAULT NULL,
  `state_residence` varchar(100) DEFAULT NULL,
  `city_residence` varchar(100) DEFAULT NULL,
  `profile_text` varchar(100) DEFAULT NULL,
  `total_time_experience` varchar(100) DEFAULT NULL,
  `skills` varchar(100) DEFAULT NULL,
  `work_experience` varchar(100) DEFAULT NULL,
  `skills_technical_software` varchar(100) DEFAULT NULL,
  `condition_disability` varchar(1000) DEFAULT NULL,
  `level_job` varchar(12) DEFAULT NULL,
  `other_studies` varchar(1000) DEFAULT NULL,
  `possibility_fly` varchar(1000) DEFAULT NULL,
  `salary_range_min` varchar(1000) DEFAULT NULL,
  `salary_range_max` varchar(1000) DEFAULT NULL,
  `retired` varchar(100) DEFAULT NULL,
  `employee` varchar(100) DEFAULT NULL,
  `independent` varchar(100) DEFAULT NULL,
  `have_business` varchar(100) DEFAULT NULL,
  `cumulative_average` varchar(100) DEFAULT NULL,
  `branch` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `bulk_load_log`
--

CREATE TABLE `bulk_load_log` (
  `id` bigint NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime DEFAULT NULL,
  `uploading` bit(1) DEFAULT NULL,
  `total_to_upload` bigint DEFAULT NULL,
  `uploaded_records` bigint DEFAULT NULL,
  `processing` bit(1) DEFAULT NULL,
  `total_records` bigint DEFAULT NULL,
  `success_records` bigint DEFAULT NULL,
  `failed_records` bigint DEFAULT NULL,
  `owner` varchar(100) NOT NULL,
  `upload_messages` text,
  `error_messages` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_approval_program_academic_practice`
--

CREATE TABLE `change_status_approval_program_academic_practice` (
  `id` bigint NOT NULL,
  `program_id` bigint NOT NULL DEFAULT '0',
  `academic_practice_id` bigint NOT NULL DEFAULT '0',
  `status` varchar(30) NOT NULL DEFAULT '0',
  `comment` text,
  `date` datetime NOT NULL,
  `user_updater` varchar(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Registra el log de cambio de estados para las aprobaciones de los programas asociados a una práctica académica';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_authorized_practice`
--

CREATE TABLE `change_status_authorized_practice` (
  `id` bigint NOT NULL,
  `authorized_practice_id` bigint NOT NULL,
  `status_before` bigint DEFAULT NULL,
  `status_after` bigint NOT NULL,
  `reason` varchar(100) DEFAULT NULL,
  `dateCreation` datetime DEFAULT NULL,
  `user_creator` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_company`
--

CREATE TABLE `change_status_company` (
  `id` bigint NOT NULL,
  `company_id` bigint NOT NULL,
  `status_before` varchar(20) DEFAULT NULL,
  `status_after` varchar(20) DEFAULT NULL,
  `comment` varchar(500) DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_legalized`
--

CREATE TABLE `change_status_legalized` (
  `change_status_legalized_id` bigint NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `change_status_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_legalized_before` varchar(20) DEFAULT NULL,
  `status_legalized_after` varchar(20) NOT NULL DEFAULT 'POSTULANT_REVIEW',
  `change_status_observation` text,
  `change_status_observation_document` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_monitoring_legalized`
--

CREATE TABLE `change_status_monitoring_legalized` (
  `change_status_monitoring_legalized_id` bigint NOT NULL,
  `monitoring_legalized_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `change_status_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_legalized_before` varchar(20) DEFAULT NULL,
  `status_legalized_after` varchar(20) NOT NULL DEFAULT 'POSTULANT_REVIEW',
  `change_status_observation` text,
  `change_status_observation_document` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_monitoring_plan`
--

CREATE TABLE `change_status_monitoring_plan` (
  `id` bigint NOT NULL,
  `monitoring_plan_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `change_status_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_plan_before` varchar(50) DEFAULT NULL,
  `status_plan_after` varchar(50) NOT NULL DEFAULT 'POSTULANT_REVIEW',
  `change_status_observation` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_opportunity`
--

CREATE TABLE `change_status_opportunity` (
  `id` bigint NOT NULL,
  `opportunity_id` bigint NOT NULL,
  `status_before` varchar(20) NOT NULL,
  `status_after` varchar(20) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  `contract` bit(1) DEFAULT NULL,
  `contracted` varchar(200) DEFAULT NULL,
  `why_no_contracted` varchar(100) DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `comment` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_practice_plan`
--

CREATE TABLE `change_status_practice_plan` (
  `id` bigint NOT NULL,
  `practice_plan_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `change_type` varchar(30) NOT NULL DEFAULT 'STATUS',
  `change_status_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_data_plan_before` varchar(2000) DEFAULT NULL,
  `status_data_plan_after` varchar(2000) NOT NULL DEFAULT 'PENDING_REVIEW_PRACTICE_PLAN',
  `change_status_observation` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `change_status_user`
--

CREATE TABLE `change_status_user` (
  `id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `status_before` varchar(45) NOT NULL,
  `status_after` varchar(45) NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `user_type` varchar(45) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `city`
--

CREATE TABLE `city` (
  `id` bigint NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `cod_dian` varchar(30) DEFAULT NULL,
  `state_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `company`
--

CREATE TABLE `company` (
  `id` bigint NOT NULL,
  `trade_name` varchar(150) DEFAULT NULL,
  `business_name` varchar(150) DEFAULT NULL,
  `identification_number` varchar(100) NOT NULL,
  `address` varchar(100) NOT NULL,
  `phone_number` varchar(100) NOT NULL,
  `sector` bigint DEFAULT NULL,
  `snies_sector` bigint DEFAULT NULL,
  `ciiu_code` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `size` bigint DEFAULT NULL,
  `resources_type` bigint DEFAULT NULL,
  `authorize_logo_usage` bit(1) DEFAULT b'0',
  `want_practice_aggrement` bit(1) DEFAULT b'0',
  `arl` bigint DEFAULT NULL,
  `logo_id` bigint DEFAULT NULL,
  `web` varchar(100) DEFAULT NULL,
  `dominio` varchar(100) NOT NULL,
  `linkedin` varchar(100) DEFAULT NULL,
  `facebook` varchar(100) DEFAULT NULL,
  `twitter` varchar(100) DEFAULT NULL,
  `instagram` varchar(100) DEFAULT NULL,
  `chamber_commerce_cert` bigint DEFAULT NULL,
  `rut` bigint DEFAULT NULL,
  `lr_firstname` varchar(100) DEFAULT NULL,
  `lr_lastname` varchar(100) DEFAULT NULL,
  `lr_identification_type` bigint DEFAULT NULL,
  `lr_identification` varchar(20) DEFAULT NULL,
  `lr_email` varchar(256) DEFAULT NULL,
  `reps_code` varchar(20) DEFAULT NULL,
  `conaces_agg_code` varchar(20) DEFAULT NULL,
  `conaces_agg_start_date` date DEFAULT NULL,
  `conaces_agg_end_date` date DEFAULT NULL,
  `conaces_agg_quota` varchar(20) DEFAULT '0',
  `is_agency_head_hunter` bit(1) NOT NULL DEFAULT b'0',
  `agency_head_hunter_cert` bigint DEFAULT NULL,
  `program_ids` varchar(100) DEFAULT NULL,
  `status` varchar(100) NOT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` datetime DEFAULT NULL,
  `user_updated` varchar(100) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL,
  `country` bigint DEFAULT NULL,
  `city` bigint DEFAULT NULL,
  `identification_type` bigint DEFAULT NULL,
  `business_sector` bigint DEFAULT NULL,
  `can_create_offer` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `company_black_list`
--

CREATE TABLE `company_black_list` (
  `id` bigint NOT NULL COMMENT 'identificador unico de la tabla',
  `business_name` varchar(250) NOT NULL COMMENT 'razon social',
  `identification_number` varchar(100) NOT NULL COMMENT 'numero de identificacion',
  `date_creation` datetime NOT NULL COMMENT 'Fecha de creación',
  `user_creator` varchar(100) NOT NULL,
  `status` varchar(10) NOT NULL COMMENT 'Estado del registro'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Almacena todas las empresas que estan en la lista clinton o vetadas por la universidad.';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `company_document`
--

CREATE TABLE `company_document` (
  `id` bigint NOT NULL,
  `name` varchar(250) NOT NULL,
  `company_id` bigint NOT NULL,
  `attachment_id` bigint NOT NULL,
  `document_type` bigint NOT NULL,
  `aggrement_type` bigint NOT NULL,
  `aggrement_code` varchar(50) DEFAULT NULL,
  `agg_start_date` date DEFAULT NULL,
  `agg_end_date` date DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `company_office`
--

CREATE TABLE `company_office` (
  `id` bigint NOT NULL,
  `company` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `address` varchar(100) NOT NULL,
  `phone` varchar(100) NOT NULL,
  `dominio` varchar(100) NOT NULL,
  `country` bigint DEFAULT NULL,
  `city` bigint DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `company_user`
--

CREATE TABLE `company_user` (
  `company_user_id` bigint NOT NULL,
  `position` varchar(150) DEFAULT NULL,
  `principal` bit(1) DEFAULT NULL,
  `company_id` bigint NOT NULL,
  `dependence` varchar(100) DEFAULT NULL,
  `phone` varchar(100) DEFAULT NULL,
  `extent` varchar(100) DEFAULT NULL,
  `cmp_alternate_email` varchar(150) DEFAULT NULL,
  `country` bigint DEFAULT NULL,
  `city` bigint DEFAULT NULL,
  `address` varchar(100) NOT NULL,
  `is_tutor` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `country`
--

CREATE TABLE `country` (
  `id` bigint NOT NULL,
  `sortname` varchar(3) NOT NULL,
  `iso_alpha_2` varchar(2) DEFAULT NULL,
  `iso_numeric` smallint DEFAULT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `course`
--

CREATE TABLE `course` (
  `id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `academic_id` varchar(20) DEFAULT NULL,
  `level` bigint NOT NULL,
  `faculty` int NOT NULL,
  `area` bigint NOT NULL,
  `status` varchar(10) NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_update` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `course_temp`
--

CREATE TABLE `course_temp` (
  `code` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `level` bigint NOT NULL,
  `faculty` int NOT NULL,
  `area` bigint NOT NULL,
  `status` varchar(20) NOT NULL,
  `user_creator` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_companies`
--

CREATE TABLE `dashboard_companies` (
  `NOMBRE_COMERCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `RAZON_SOCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `ID_EMPRESA` bigint DEFAULT NULL,
  `NIT_EMPRESA` varchar(255) DEFAULT NULL,
  `ID_PAIS_EMPRESA` bigint DEFAULT NULL,
  `PAIS_EMPRESA` varchar(255) DEFAULT NULL,
  `ID_CIUDAD_EMPRESA` bigint DEFAULT NULL,
  `CIUDAD_EMPRESA` varchar(255) DEFAULT NULL,
  `SECTOR_COMERCIAL` varchar(255) DEFAULT NULL,
  `PUEDE_CREAR_EMPRESAS` varchar(25) DEFAULT NULL,
  `ESTADO_EMPRESA` varchar(25) DEFAULT NULL,
  `CANT_VACANTES` bigint DEFAULT NULL,
  `PERFILES_REVISADOS` decimal(20,5) DEFAULT NULL,
  `DESCARGAS` decimal(20,5) DEFAULT NULL,
  `APLICACIONES` bigint DEFAULT NULL,
  `FECHA_CREACION_EMPRESA` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_companies_applications`
--

CREATE TABLE `dashboard_companies_applications` (
  `NOMBRE_COMERCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `RAZON_SOCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `ID_EMPRESA` bigint DEFAULT NULL,
  `NIT_EMPRESA` varchar(255) DEFAULT NULL,
  `PAIS_EMPRESA` varchar(255) DEFAULT NULL,
  `CIUDAD_EMPRESA` varchar(255) DEFAULT NULL,
  `SECTOR_COMERCIAL` varchar(255) DEFAULT NULL,
  `PUEDE_CREAR_EMPRESAS` varchar(25) DEFAULT NULL,
  `ESTADO_EMPRESA` varchar(25) DEFAULT NULL,
  `ID_OPORTUNIDAD` bigint DEFAULT NULL,
  `CANT_VACANTES` bigint DEFAULT NULL,
  `TIPO_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `FECHA_CREACION_OFERTA` date DEFAULT NULL,
  `FECHA_ACTIVACION_OFERTA` date DEFAULT NULL,
  `ESTADO_OFERTA` varchar(255) DEFAULT NULL,
  `ID_APLICACION` bigint DEFAULT NULL,
  `APLICO` varchar(255) DEFAULT NULL,
  `PERFIL_REVISADO` varchar(255) DEFAULT NULL,
  `PERFIL_DESCARGADO` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_companies_opportunities`
--

CREATE TABLE `dashboard_companies_opportunities` (
  `NOMBRE_COMERCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `RAZON_SOCIAL_EMPRESA` varchar(255) DEFAULT NULL,
  `ID_EMPRESA` bigint DEFAULT NULL,
  `NIT_EMPRESA` varchar(255) DEFAULT NULL,
  `PAIS_EMPRESA` varchar(255) DEFAULT NULL,
  `CIUDAD_EMPRESA` varchar(255) DEFAULT NULL,
  `SECTOR_COMERCIAL` varchar(255) DEFAULT NULL,
  `PUEDE_CREAR_EMPRESAS` varchar(25) DEFAULT NULL,
  `ESTADO_EMPRESA` varchar(25) DEFAULT NULL,
  `ID_OPORTUNIDAD` bigint DEFAULT NULL,
  `CANT_VACANTES` bigint DEFAULT NULL,
  `TIPO_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `FECHA_CREACION_OFERTA` date DEFAULT NULL,
  `FECHA_ACTIVACION_OFERTA` date DEFAULT NULL,
  `ESTADO_OFERTA` varchar(255) DEFAULT NULL,
  `PERFILES_REVISADOS` decimal(20,5) DEFAULT NULL,
  `DESCARGAS` decimal(20,5) DEFAULT NULL,
  `APLICACIONES` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_companies_performance`
--

CREATE TABLE `dashboard_companies_performance` (
  `COMPANY_ID` bigint DEFAULT NULL,
  `PERFILES_REVISADOS` varchar(255) DEFAULT NULL,
  `DESCARGAS` varchar(255) DEFAULT NULL,
  `NUMERO_APLICACIONES` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_legalization`
--

CREATE TABLE `dashboard_legalization` (
  `ID_LEGALIZACION` int DEFAULT NULL,
  `ID_POSTULANTE` int DEFAULT NULL,
  `CODIGO_PROGRAMA_LEGALIZADO` varchar(20) DEFAULT NULL,
  `NOMBRE_PROGRAMA_LEGALIZADO` varchar(100) DEFAULT NULL,
  `PAIS_LEGALIZACION` varchar(150) DEFAULT NULL,
  `CIUDAD_LEGALIZACION` varchar(150) DEFAULT NULL,
  `PRACTICA_AUTOGESTIONADA` varchar(2) DEFAULT NULL,
  `CANAL_CONSECUCION` varchar(200) DEFAULT NULL,
  `FECHA_CREACION_LEGALIZACION` datetime DEFAULT NULL,
  `ESTADO_LEGALIZACION` varchar(40) DEFAULT NULL,
  `PERIODO` varchar(10) DEFAULT NULL,
  `SALARIO_LEGALIZACION` int DEFAULT NULL,
  `TIPO_CONTRACTO_PRACT_LEGA` varchar(200) DEFAULT NULL,
  `ES_PAGADA_LEGALIZACION` varchar(2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_opportunity`
--

CREATE TABLE `dashboard_opportunity` (
  `OPORTUNIDAD_ID` bigint DEFAULT NULL,
  `NUMERO_VACANTE` bigint DEFAULT NULL,
  `TIPO_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `EMPRESA_ID` bigint DEFAULT NULL,
  `EMPRESA_NOMBRE` varchar(255) DEFAULT NULL,
  `EMPRESA_PAIS_SORTNAME` varchar(255) DEFAULT NULL,
  `EMPRESA_PAIS` varchar(255) DEFAULT NULL,
  `EMPRESA_CIUDAD` varchar(25) DEFAULT NULL,
  `FECHA_VENCIMIENTO` date DEFAULT NULL,
  `FECHA_VENCIMIENTO_ANNO` bigint DEFAULT NULL,
  `FECHA_VENCIMIENTO_MES` bigint DEFAULT NULL,
  `FECHA_CREACION` date DEFAULT NULL,
  `FECHA_CREACION_ANNO` bigint DEFAULT NULL,
  `FECHA_CREACION_MES` bigint DEFAULT NULL,
  `FECHA_ACTIVACION` date DEFAULT NULL,
  `FECHA_ACTIVACION_ANNO` bigint DEFAULT NULL,
  `FECHA_ACTIVACION_MES` bigint DEFAULT NULL,
  `ESTADO` varchar(255) DEFAULT NULL,
  `SALARIO_MAX` bigint DEFAULT NULL,
  `SALARIO_MIN` bigint DEFAULT NULL,
  `TIPO_CONTRATO` varchar(255) DEFAULT NULL,
  `ANNO_EXPERIENCIA` varchar(255) DEFAULT NULL,
  `DEDICACION` varchar(255) DEFAULT NULL,
  `CARGO` varchar(255) DEFAULT NULL,
  `CIUDAD_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `PAIS_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `DEDICACION_HORAS` varchar(255) DEFAULT NULL,
  `PERIODO` varchar(255) DEFAULT NULL,
  `ES_PAGA` bigint DEFAULT NULL,
  `APLICACIONES` bigint DEFAULT NULL,
  `APLICO` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_opportunity_aplication`
--

CREATE TABLE `dashboard_opportunity_aplication` (
  `OPORTUNIDAD_ID` bigint DEFAULT NULL,
  `TIPO_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `APLICACION_ID` bigint DEFAULT NULL,
  `POSTULANTE_ID` bigint DEFAULT NULL,
  `NOMBRE` varchar(255) DEFAULT NULL,
  `APELLIDO` varchar(255) DEFAULT NULL,
  `CONTRATADO` varchar(255) DEFAULT NULL,
  `GENERO` varchar(25) DEFAULT NULL,
  `FECHA_CREACION_OPORTUNIDAD` datetime DEFAULT NULL,
  `FECHA_CREACION_OPORTUNIDAD_ANNO` bigint DEFAULT NULL,
  `FECHA_CREACION_OPORTUNIDAD_MES` bigint DEFAULT NULL,
  `FECHA_CREACION_APLICACION` datetime DEFAULT NULL,
  `FECHA_CREACION_APLICACION_ANNO` bigint DEFAULT NULL,
  `FECHA_CREACION_APLICACION_MES` bigint DEFAULT NULL,
  `EMPRESA_ID` bigint DEFAULT NULL,
  `EMPRESA_NOMBRE` varchar(255) DEFAULT NULL,
  `FECHA_CREACION_EMPRESA` datetime DEFAULT NULL,
  `EMPRESA_PAIS` varchar(255) DEFAULT NULL,
  `EMPRESA_PAIS_ID` bigint DEFAULT NULL,
  `FECHA_CIERRE_OPP` date DEFAULT NULL,
  `APLICO` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_opportunity_aplication_count`
--

CREATE TABLE `dashboard_opportunity_aplication_count` (
  `OPORTUNIDAD_ID` bigint DEFAULT NULL,
  `NUMERO_APLICACIONES` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_opportunity_program`
--

CREATE TABLE `dashboard_opportunity_program` (
  `OPORTUNIDAD_ID` bigint DEFAULT NULL,
  `TIPO_OPORTUNIDAD` varchar(255) DEFAULT NULL,
  `PROGRAMA` varchar(255) DEFAULT NULL,
  `NIVEL` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_postulant`
--

CREATE TABLE `dashboard_postulant` (
  `ID_POSTULANTE` int DEFAULT NULL,
  `ID_PERFIL` int DEFAULT NULL,
  `CORREO_POSTULANTE` varchar(150) DEFAULT NULL,
  `NOMBRE_POSTULANTE` varchar(255) DEFAULT NULL,
  `APELLIDO_POSTULANTE` varchar(255) DEFAULT NULL,
  `CEDULA_POSTUTLANT` varchar(30) DEFAULT NULL,
  `TIPO_DOC_POSTULANTE` varchar(5) DEFAULT NULL,
  `GENERO_POSTULANTE` varchar(6) DEFAULT NULL,
  `FECHA_NAC_POSTULANTE` date DEFAULT NULL,
  `PAIS_RESIDENCIA_POSTULANTE` varchar(100) DEFAULT NULL,
  `DEP_RESIDENCIA_POSTULANTE` varchar(100) DEFAULT NULL,
  `CIUDAD_RESIDENCIA_POSTULANTE` varchar(100) DEFAULT NULL,
  `PERFIL_LLENO` varchar(2) DEFAULT NULL,
  `ACEPTO_TERMS` varchar(2) DEFAULT NULL,
  `ANOS_EXP` varchar(20) DEFAULT NULL,
  `TIEMPO_TOTAL_EXP` int DEFAULT NULL,
  `FECHA_ACTUALIZACION_PERFIL` datetime DEFAULT NULL,
  `ESTADO_USUARIO` varchar(10) DEFAULT NULL,
  `ESTADO_POSTULANTE` varchar(10) DEFAULT NULL,
  `ES_EGRESADO` varchar(2) DEFAULT NULL,
  `ES_ESTUDIANTE` varchar(2) DEFAULT NULL,
  `FECHA_ACTUALIZACION_USUARIO` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_postulant_academic`
--

CREATE TABLE `dashboard_postulant_academic` (
  `ID_POSTULANT_ACADEMICO` int DEFAULT NULL,
  `ID_PROFILE_ACADEMICO` int DEFAULT NULL,
  `GENERO_POSTULANTE` varchar(6) DEFAULT NULL,
  `ANOS_EXP` varchar(20) DEFAULT NULL,
  `PERFIL_LLENO` varchar(2) DEFAULT NULL,
  `FECHA_ACTUALIZACION_PERFIL` datetime DEFAULT NULL,
  `ESTADO_POSTULANTE` varchar(8) DEFAULT NULL,
  `CODIGO_PROGRAMA_EN_CURSO` varchar(10) DEFAULT NULL,
  `NOMBRE_PROGRAMA_EN_CURSO` varchar(100) DEFAULT NULL,
  `NIVEL_PROGRAMA_EN_CURSO` varchar(5) DEFAULT NULL,
  `CODIGO_PROGRAMA_FINALIZADO` varchar(10) DEFAULT NULL,
  `NOMBRE_PROGRAMA_FINALIZADO` varchar(100) DEFAULT NULL,
  `NIVEL_PROGRAMA_FINALIZADO` varchar(5) DEFAULT NULL,
  `FECHA_GRADO` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dashboard_postulant_authorization`
--

CREATE TABLE `dashboard_postulant_authorization` (
  `ID_POSTULANT_ACADEMICO` int NOT NULL,
  `ID_PROFILE_ACADEMICO` int NOT NULL,
  `GENERO_POSTULANTE` varchar(10) NOT NULL,
  `PERFIL_LLENO` varchar(2) NOT NULL,
  `ESTADO_POSTULANTE` varchar(15) NOT NULL,
  `ID_AUTORIZACION` int DEFAULT NULL,
  `CODIGO_PROGRAMA_AUTORIZADO` varchar(10) DEFAULT NULL,
  `NOMBRE_PROGRAMA_AUTORIZADO` varchar(100) DEFAULT NULL,
  `PERIODO` varchar(10) DEFAULT NULL,
  `ESTADO_AUTORIZACION` varchar(20) DEFAULT NULL,
  `FECHA_CREACION_AUTORIZACION` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_creation_log`
--

CREATE TABLE `document_creation_log` (
  `id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `document_type` varchar(25) NOT NULL,
  `content` varchar(500) DEFAULT NULL,
  `observations` varchar(256) DEFAULT NULL,
  `date_creation` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_monitoring`
--

CREATE TABLE `document_monitoring` (
  `document_monitoring_definition_id` bigint NOT NULL,
  `monitoring_legalized_id` bigint NOT NULL,
  `document_attached_id` bigint NOT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `document_status` varchar(20) DEFAULT 'PENDING_APPROVAL'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_monitoring_definition`
--

CREATE TABLE `document_monitoring_definition` (
  `document_monitoring_definition_id` bigint NOT NULL,
  `document_name` varchar(100) NOT NULL,
  `document_observation` varchar(500) DEFAULT NULL,
  `document_mandatory` bit(1) DEFAULT b'0',
  `document_order` int NOT NULL,
  `model_attached_id` bigint DEFAULT NULL,
  `document_type_id` bigint NOT NULL,
  `template_attached_id` bigint DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `functional_letter` tinyint(1) DEFAULT '0',
  `show_form_tracing` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_practice`
--

CREATE TABLE `document_practice` (
  `document_practice_definition_id` bigint NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `document_attached_id` bigint NOT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `document_status` varchar(20) DEFAULT 'PENDING_APPROVAL',
  `approved_by_company` tinyint(1) DEFAULT '0',
  `approved_by_university` tinyint(1) DEFAULT '0',
  `approved_by_student` tinyint(1) DEFAULT '0',
  `date_approved_by_company` timestamp NULL DEFAULT NULL,
  `date_approved_by_university` timestamp NULL DEFAULT NULL,
  `date_approved_by_student` timestamp NULL DEFAULT NULL,
  `ip_approved_by_university` varchar(50) DEFAULT NULL,
  `ip_approved_by_company` varchar(50) DEFAULT NULL,
  `ip_approved_by_student` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_practice_definition`
--

CREATE TABLE `document_practice_definition` (
  `document_practice_definition_id` bigint NOT NULL,
  `document_type_id` bigint NOT NULL,
  `template_attached_id` bigint DEFAULT NULL,
  `model_attached_id` bigint DEFAULT NULL,
  `document_name` varchar(100) NOT NULL,
  `document_observation` varchar(500) DEFAULT NULL,
  `document_mandatory` bit(1) DEFAULT b'0',
  `document_order` int NOT NULL,
  `practice_type` bigint NOT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `functional_letter` tinyint(1) DEFAULT '0',
  `show_form_tracing` tinyint(1) DEFAULT '0',
  `binding_agreement` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `document_practice_def_program`
--

CREATE TABLE `document_practice_def_program` (
  `document_practice_definition_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dynamic_list`
--

CREATE TABLE `dynamic_list` (
  `id` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(45) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `evaluations`
--

CREATE TABLE `evaluations` (
  `evaluation_id` bigint NOT NULL,
  `med_enc_id_student` bigint DEFAULT NULL,
  `med_enc_id_boss` bigint DEFAULT NULL,
  `med_enc_id_monitor` bigint DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `period` bigint NOT NULL,
  `type_survey` bigint NOT NULL,
  `practice_type` bigint DEFAULT NULL,
  `faculty_id` int DEFAULT NULL,
  `total_bosses` int DEFAULT NULL,
  `total_students` int DEFAULT NULL,
  `total_monitors` int DEFAULT NULL,
  `percentage_bosses` int DEFAULT NULL,
  `percentage_students` int DEFAULT NULL,
  `percentage_monitors` int DEFAULT NULL,
  `start_date` date NOT NULL,
  `finish_date` date NOT NULL,
  `alert_value` smallint DEFAULT '0',
  `alert_unit` varchar(10) DEFAULT NULL,
  `alert_when` varchar(25) DEFAULT NULL,
  `status` varchar(25) NOT NULL DEFAULT 'CREATED',
  `date_sent` datetime DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_creator` varchar(150) NOT NULL,
  `date_updater` datetime DEFAULT NULL,
  `user_updater` varchar(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `evaluation_program`
--

CREATE TABLE `evaluation_program` (
  `evaluation_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `faculty`
--

CREATE TABLE `faculty` (
  `faculty_id` int NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(256) NOT NULL,
  `authorized_signer` varchar(200) DEFAULT NULL,
  `identification_type_signer` bigint DEFAULT NULL,
  `identification_signer` varchar(20) DEFAULT '0',
  `identification_from_signer` bigint DEFAULT NULL,
  `position_signer` varchar(100) DEFAULT '',
  `mail_signer` varchar(200) DEFAULT NULL,
  `academic_signer` varchar(200) DEFAULT NULL,
  `position_academic_signer` varchar(100) DEFAULT '',
  `mail_academic_signer` varchar(200) DEFAULT '',
  `branch_id` bigint NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creater` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_update` varchar(100) DEFAULT NULL,
  `status` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `item`
--

CREATE TABLE `item` (
  `id` bigint NOT NULL,
  `value` varchar(100) NOT NULL,
  `value_for_reports` varchar(50) DEFAULT NULL,
  `value_for_calculations` varchar(5) DEFAULT NULL,
  `description` varchar(300) DEFAULT NULL,
  `parent_id` bigint DEFAULT NULL,
  `status` varchar(100) NOT NULL,
  `list_id` varchar(100) NOT NULL,
  `sort` bigint DEFAULT NULL,
  `filters` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `item_academic_practice_cities`
--

CREATE TABLE `item_academic_practice_cities` (
  `academic_practice_id` bigint NOT NULL,
  `city_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `item_academic_practice_emotional_salary`
--

CREATE TABLE `item_academic_practice_emotional_salary` (
  `id` bigint NOT NULL,
  `academic_practice_id` bigint NOT NULL,
  `item_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `item_job_offer_cities`
--

CREATE TABLE `item_job_offer_cities` (
  `job_offer_id` bigint NOT NULL,
  `city_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `item_job_offer_emotional_salary`
--

CREATE TABLE `item_job_offer_emotional_salary` (
  `id` bigint NOT NULL,
  `job_offer_id` bigint NOT NULL DEFAULT '0',
  `item_id` bigint NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `job_offer`
--

CREATE TABLE `job_offer` (
  `job_offer_id` bigint NOT NULL,
  `company_name_is_confidentiality` bit(1) DEFAULT b'0',
  `years_experience` bigint NOT NULL,
  `dedication` bigint NOT NULL,
  `contract_type` bigint NOT NULL,
  `salary_range_min` int NOT NULL,
  `salary_range_max` int NOT NULL,
  `salary_range_is_confidentiality` bit(1) DEFAULT b'0',
  `country` bigint NOT NULL,
  `position_level` bigint DEFAULT NULL,
  `travel_availability` bit(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `job_offer_opportunity_language`
--

CREATE TABLE `job_offer_opportunity_language` (
  `job_offer_id` bigint NOT NULL,
  `opportunity_language_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `job_offer_skills`
--

CREATE TABLE `job_offer_skills` (
  `job_offer_id` bigint NOT NULL,
  `skill_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `licensing_configuration`
--

CREATE TABLE `licensing_configuration` (
  `id` bigint NOT NULL,
  `param` varchar(300) DEFAULT NULL,
  `value` varchar(1000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `menu_page`
--

CREATE TABLE `menu_page` (
  `id` int NOT NULL,
  `content` mediumtext,
  `user_updated` varchar(255) DEFAULT NULL,
  `date_update` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_activities_definitions`
--

CREATE TABLE `monitoring_activities_definitions` (
  `activity_id` bigint NOT NULL,
  `activity_name` varchar(100) NOT NULL,
  `activity_mandatory` tinyint(1) NOT NULL,
  `can_create_by_tutor` bit(1) NOT NULL DEFAULT b'0',
  `can_edit_by_tutor` bit(1) NOT NULL DEFAULT b'0',
  `can_delete_by_tutor` bit(1) NOT NULL DEFAULT b'0',
  `can_create_by_student` bit(1) NOT NULL DEFAULT b'0',
  `can_edit_by_student` bit(1) NOT NULL DEFAULT b'0',
  `can_delete_by_student` bit(1) NOT NULL DEFAULT b'0',
  `can_create_by_monitor` tinyint(1) DEFAULT '0',
  `can_edit_by_monitor` tinyint(1) DEFAULT '0',
  `can_delete_by_monitor` tinyint(1) DEFAULT '0',
  `incident` tinyint(1) DEFAULT '0',
  `general_activity` tinyint(1) DEFAULT '0',
  `absence` tinyint(1) DEFAULT '0',
  `special_case` tinyint(1) DEFAULT '0',
  `requires_tutor_approval` bit(1) NOT NULL DEFAULT b'0',
  `requires_monitor_approval` tinyint(1) DEFAULT '0',
  `template_attached` bigint DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `activity_detail` varchar(256) DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_activity_assistance`
--

CREATE TABLE `monitoring_activity_assistance` (
  `id` bigint NOT NULL,
  `activity_log_id` bigint NOT NULL,
  `student_name` varchar(200) DEFAULT NULL,
  `student_lastname` varchar(200) DEFAULT NULL,
  `student_identification` varchar(50) DEFAULT NULL,
  `student_program_id` bigint DEFAULT NULL,
  `date_creation` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_activity_log`
--

CREATE TABLE `monitoring_activity_log` (
  `activity_log_id` bigint NOT NULL,
  `uuid` varchar(40) NOT NULL,
  `tracing_monitoring_id` bigint NOT NULL,
  `activity_type` bigint NOT NULL,
  `monitoring_plan_id` bigint DEFAULT NULL,
  `advantage_percentage_activity` decimal(3,2) NOT NULL,
  `complete_activity` tinyint(1) NOT NULL,
  `observation_activity` text,
  `first_attachment` bigint DEFAULT NULL,
  `second_attachment` bigint DEFAULT NULL,
  `activity_date` timestamp NULL DEFAULT NULL,
  `called_student_count` smallint DEFAULT '0',
  `hour_count` float DEFAULT NULL,
  `student_count` smallint DEFAULT '0',
  `actions` text,
  `assistance` tinyint(1) DEFAULT '0',
  `assistance_url` varchar(250) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_approved_activity` timestamp NULL DEFAULT NULL,
  `user_approved_activity` varchar(200) DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `status` varchar(40) DEFAULT 'PENDING_REVIEW_ACTIVITY_LOG'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_allowed_extensions`
--

CREATE TABLE `monitoring_allowed_extensions` (
  `document_monitoring_definition_id` bigint NOT NULL,
  `item_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_evaluation`
--

CREATE TABLE `monitoring_evaluation` (
  `evaluation_id` bigint NOT NULL,
  `uuid` varchar(120) DEFAULT NULL,
  `med_enc_id_student` bigint DEFAULT NULL,
  `med_enc_id_teacher` bigint DEFAULT NULL,
  `med_enc_id_coord` bigint DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `period` bigint NOT NULL,
  `type_survey` bigint NOT NULL,
  `faculty_id` int DEFAULT NULL,
  `total_teachers` int DEFAULT NULL,
  `total_students` int DEFAULT NULL,
  `total_coordinators` int DEFAULT NULL,
  `percentage_teachers` int DEFAULT NULL,
  `percentage_students` int DEFAULT NULL,
  `percentage_coords` int DEFAULT NULL,
  `start_date` date NOT NULL,
  `finish_date` date NOT NULL,
  `status` varchar(25) NOT NULL DEFAULT 'CREATED',
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_creator` varchar(150) NOT NULL,
  `date_updater` datetime DEFAULT NULL,
  `user_updater` varchar(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_evaluation_category`
--

CREATE TABLE `monitoring_evaluation_category` (
  `evaluation_id` bigint NOT NULL,
  `category` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_evaluation_program`
--

CREATE TABLE `monitoring_evaluation_program` (
  `evaluation_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_legalized`
--

CREATE TABLE `monitoring_legalized` (
  `monitoring_legalized_id` bigint NOT NULL,
  `uuid` varchar(40) DEFAULT NULL,
  `monitoring_title` varchar(100) NOT NULL,
  `dedication_hours` bigint DEFAULT NULL,
  `category` bigint DEFAULT NULL,
  `course` bigint DEFAULT NULL,
  `hour_limit` smallint DEFAULT NULL,
  `account_type` bigint DEFAULT NULL,
  `fin_account_number` varchar(30) NOT NULL DEFAULT '',
  `remuneration_hour_per_week` bigint DEFAULT NULL,
  `is_advanced` tinyint(1) DEFAULT NULL,
  `fin_bank` bigint DEFAULT NULL,
  `eps` bigint DEFAULT NULL,
  `fin_contract` varchar(40) DEFAULT NULL,
  `residence_area` bigint DEFAULT NULL,
  `locality` varchar(120) DEFAULT NULL,
  `cost_center` varchar(30) DEFAULT NULL,
  `responsable` varchar(120) DEFAULT NULL,
  `mail_responsable` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'CREATED',
  `study_working_id` bigint DEFAULT NULL,
  `user_coordinator` bigint DEFAULT NULL,
  `user_teacher` bigint DEFAULT NULL,
  `postulant_ml` bigint NOT NULL,
  `program_ml` bigint NOT NULL,
  `faculty_ml` int DEFAULT NULL,
  `period_ml` bigint DEFAULT NULL,
  `evaluation_id` bigint DEFAULT NULL,
  `med_monitor_id` bigint DEFAULT NULL,
  `med_coordinator_id` bigint DEFAULT NULL,
  `med_teacher_id` bigint DEFAULT NULL,
  `url_evaluation_students` varchar(255) DEFAULT NULL,
  `url_eval_student_results` varchar(255) DEFAULT NULL,
  `date_approval_ml` timestamp NULL DEFAULT NULL,
  `date_creation` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `date_updater` timestamp NULL DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_plan`
--

CREATE TABLE `monitoring_plan` (
  `id` bigint NOT NULL,
  `monitoring_legalized_id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `study_working_id` bigint DEFAULT NULL,
  `summary` text,
  `general_skills` text NOT NULL,
  `specific_skills` text NOT NULL,
  `general_objective` text NOT NULL,
  `specific_objectives` text NOT NULL,
  `observations` text,
  `approved` tinyint(1) DEFAULT NULL,
  `date_approved` timestamp NULL DEFAULT NULL,
  `ip_approved` varchar(20) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `monitoring_plan_schedule`
--

CREATE TABLE `monitoring_plan_schedule` (
  `id` bigint NOT NULL,
  `monitoring_plan_id` bigint NOT NULL,
  `date` date DEFAULT NULL,
  `monitoring_theme` varchar(250) NOT NULL,
  `monitoring_strategies` varchar(2000) NOT NULL,
  `monitoring_activities` varchar(2000) NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notification`
--

CREATE TABLE `notification` (
  `id` bigint NOT NULL,
  `event` varchar(60) NOT NULL,
  `frecuency` varchar(50) NOT NULL,
  `template_already` mediumtext,
  `template_daily` mediumtext,
  `category` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notification_log`
--

CREATE TABLE `notification_log` (
  `id` bigint NOT NULL,
  `date_last_send` datetime NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `recipients` text,
  `ok` bit(1) DEFAULT NULL,
  `error_message` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notification_user`
--

CREATE TABLE `notification_user` (
  `id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `after_creating_opportunity` bit(1) DEFAULT b'1',
  `after_creating_opportunity_academic_practice` bit(1) DEFAULT b'1',
  `after_editing_opportunity` bit(1) DEFAULT b'1',
  `after_editing_opportunity_academic_practice` bit(1) DEFAULT b'1',
  `after_rejecting_opportunity` bit(1) DEFAULT b'0',
  `after_creating_company` bit(1) DEFAULT b'1',
  `after_updating_company` bit(1) DEFAULT b'1',
  `after_activating_opportunity_4_company` bit(1) DEFAULT b'1',
  `after_activating_opportunity_academic_practice_4_company` bit(1) DEFAULT b'1',
  `after_activating_opportunity_4_postulant` bit(1) DEFAULT b'1',
  `after_activating_opportunity_academic_practice_4_postulant` bit(1) DEFAULT b'1',
  `after_send_review_legalize` bit(1) DEFAULT b'1',
  `after_closed_opportunity` bit(1) DEFAULT b'1',
  `after_legalize_approval` bit(1) DEFAULT b'1',
  `after_legalize_rejected` bit(1) DEFAULT b'1',
  `after_interested_postulant` bit(1) DEFAULT b'1',
  `after_review_opportunity` bit(1) DEFAULT b'1',
  `after_applying_opportunity_for_company` bit(1) DEFAULT b'1',
  `after_applying_opportunity_instead_of_postulant` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notification_user_bkp`
--

CREATE TABLE `notification_user_bkp` (
  `id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `after_creating_opportunity` bit(1) DEFAULT b'1',
  `after_editing_opportunity` bit(1) DEFAULT b'1',
  `after_rejecting_opportunity` bit(1) DEFAULT b'0',
  `after_creating_company` bit(1) DEFAULT b'1',
  `after_updating_company` bit(1) DEFAULT b'1',
  `after_activating_opportunity_4_company` bit(1) DEFAULT b'1',
  `after_activating_opportunity_4_postulant` bit(1) DEFAULT b'1',
  `after_send_review_legalize` bit(1) DEFAULT b'1',
  `after_legalize_company_selfmanaged` bit(1) DEFAULT b'1',
  `after_legalize_approval` bit(1) DEFAULT b'1',
  `after_legalize_rejected` bit(1) DEFAULT b'1',
  `after_interested_postulant` bit(1) DEFAULT b'1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `opportunity`
--

CREATE TABLE `opportunity` (
  `id` bigint NOT NULL,
  `uuid` varchar(40) NOT NULL DEFAULT '',
  `company_id` bigint NOT NULL,
  `closing_offer_date` datetime NOT NULL,
  `job_title` varchar(100) NOT NULL,
  `functions` text NOT NULL,
  `additional_requirements` text NOT NULL,
  `number_of_vacants` int DEFAULT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL,
  `status` varchar(100) NOT NULL,
  `date_activate` datetime DEFAULT NULL,
  `opportunity_type` varchar(100) NOT NULL,
  `branch_id` bigint DEFAULT NULL,
  `father_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `opportunity_application`
--

CREATE TABLE `opportunity_application` (
  `id` bigint NOT NULL,
  `uuid` varchar(40) NOT NULL DEFAULT '',
  `opportunity_id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `postulant_cv` bigint NOT NULL,
  `opp_required_document` bigint DEFAULT NULL,
  `status` varchar(100) NOT NULL,
  `viewed` bit(1) DEFAULT NULL,
  `revisedCompany` bit(1) DEFAULT NULL,
  `downloaded` bit(1) DEFAULT NULL,
  `contracted` bit(1) DEFAULT NULL,
  `tutor_name` varchar(200) DEFAULT NULL,
  `tutor_lastname` varchar(200) DEFAULT NULL,
  `tutor_identification_type` bigint DEFAULT NULL,
  `tutor_identification` varchar(15) DEFAULT NULL,
  `tutor_email` varchar(100) DEFAULT NULL,
  `tutor_position` varchar(150) DEFAULT NULL,
  `company_arl` bigint DEFAULT NULL,
  `practice_start_date` date DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `opportunity_language`
--

CREATE TABLE `opportunity_language` (
  `id` bigint NOT NULL,
  `language_id` bigint NOT NULL,
  `level_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `opportunity_programs`
--

CREATE TABLE `opportunity_programs` (
  `opportunity_id` bigint NOT NULL,
  `program_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pages`
--

CREATE TABLE `pages` (
  `id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `html` mediumtext,
  `url` varchar(255) DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` datetime DEFAULT NULL,
  `user_updated` varchar(100) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `parameter_configuration`
--

CREATE TABLE `parameter_configuration` (
  `id` bigint NOT NULL,
  `param` varchar(300) DEFAULT NULL,
  `value` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `parametric_message`
--

CREATE TABLE `parametric_message` (
  `id` bigint NOT NULL,
  `value` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `password_reset_key`
--

CREATE TABLE `password_reset_key` (
  `id` bigint NOT NULL,
  `key` varchar(100) NOT NULL,
  `generated_date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `postulant`
--

CREATE TABLE `postulant` (
  `type_of_identification` bigint NOT NULL,
  `gender` bigint NOT NULL,
  `dateBirth` date DEFAULT NULL,
  `country_birth_id` bigint DEFAULT NULL,
  `state_birth_id` int DEFAULT NULL,
  `city_birth_id` bigint DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` varchar(150) DEFAULT NULL,
  `country_residence_id` bigint DEFAULT NULL,
  `state_residence_id` int DEFAULT NULL,
  `city_residence_id` bigint DEFAULT NULL,
  `alternate_email` varchar(100) NOT NULL,
  `linkedin_link` varchar(100) DEFAULT NULL,
  `instagram` varchar(250) DEFAULT NULL,
  `twitter` varchar(100) DEFAULT NULL,
  `personal_website` varchar(100) DEFAULT NULL,
  `photo_id` bigint DEFAULT NULL,
  `filling_percentage` smallint DEFAULT '0',
  `filled` bit(1) DEFAULT NULL,
  `postulant_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `postulant_profile`
--

CREATE TABLE `postulant_profile` (
  `id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `student_code` varchar(45) NOT NULL,
  `academic_user` varchar(100) DEFAULT NULL,
  `academic_id` bigint DEFAULT NULL,
  `degree_option` varchar(100) DEFAULT NULL,
  `emphasis` varchar(100) DEFAULT NULL,
  `years_experience` bigint DEFAULT NULL,
  `filled` bit(1) DEFAULT b'0',
  `last_time_experience` float DEFAULT '0',
  `total_time_experience` float DEFAULT '0',
  `accept_terms` bit(1) DEFAULT b'0',
  `cv_video_link` varchar(250) DEFAULT NULL,
  `profile_text` text,
  `skills_technical_software` varchar(512) DEFAULT NULL,
  `condition_discapacity` bit(1) NOT NULL DEFAULT b'0',
  `level_job` bigint DEFAULT NULL,
  `other_studies` varchar(512) DEFAULT NULL,
  `possibility_fly` bit(1) NOT NULL DEFAULT b'0',
  `salary_range_min` int DEFAULT NULL,
  `salary_range_max` int DEFAULT NULL,
  `retired` bit(1) NOT NULL DEFAULT b'0',
  `employee` bit(1) NOT NULL DEFAULT b'0',
  `independent` bit(1) NOT NULL DEFAULT b'0',
  `have_business` bit(1) NOT NULL DEFAULT b'0',
  `company_name` varchar(256) DEFAULT NULL,
  `company_sector` bigint DEFAULT NULL,
  `web_site_company` varchar(256) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `practice_boss`
--

CREATE TABLE `practice_boss` (
  `boss_id` bigint NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `identification_type` bigint DEFAULT NULL,
  `identification` varchar(20) DEFAULT NULL,
  `job` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone_number` decimal(10,0) NOT NULL,
  `phone_extension` decimal(10,0) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `practice_evaluation`
--

CREATE TABLE `practice_evaluation` (
  `id` bigint UNSIGNED NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `evaluation_id` bigint NOT NULL,
  `med_boss_id` bigint DEFAULT NULL,
  `med_student_id` bigint DEFAULT NULL,
  `med_monitor_id` bigint DEFAULT NULL,
  `med_boss_status` varchar(1) DEFAULT NULL,
  `med_student_status` varchar(1) DEFAULT NULL,
  `med_monitor_status` varchar(1) DEFAULT NULL,
  `med_boss_data` text,
  `med_student_data` text,
  `med_monitor_data` text,
  `last_date_send_boss` datetime DEFAULT NULL,
  `last_date_send_student` datetime DEFAULT NULL,
  `last_date_send_monitor` datetime DEFAULT NULL,
  `last_date_answer_boss` datetime DEFAULT NULL,
  `last_date_answer_student` datetime DEFAULT NULL,
  `last_date_answer_monitor` datetime DEFAULT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_creator` varchar(100) NOT NULL DEFAULT 'superadmin',
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `practice_plan`
--

CREATE TABLE `practice_plan` (
  `id` bigint NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `postulant_id` bigint NOT NULL,
  `academic_practice_id` bigint DEFAULT NULL,
  `signed_document` bigint DEFAULT NULL,
  `reception_date` date DEFAULT NULL,
  `objective_per_functions` text,
  `observations` text,
  `approved_by_tutor` tinyint(1) DEFAULT NULL,
  `approved_by_monitor` tinyint(1) DEFAULT NULL,
  `approved_by_student` tinyint(1) DEFAULT NULL,
  `date_approved_by_tutor` timestamp NULL DEFAULT NULL,
  `date_approved_by_monitor` timestamp NULL DEFAULT NULL,
  `date_approved_by_student` timestamp NULL DEFAULT NULL,
  `ip_approved_by_monitor` varchar(50) DEFAULT NULL,
  `ip_approved_by_tutor` varchar(50) DEFAULT NULL,
  `ip_approved_by_student` varchar(50) DEFAULT NULL,
  `approved_plan_data` text,
  `university_plan` tinyint(1) DEFAULT '1',
  `status` varchar(50) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_awards`
--

CREATE TABLE `profile_awards` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `award_type` bigint NOT NULL,
  `description` varchar(500) DEFAULT '  ',
  `name` varchar(200) NOT NULL,
  `award_date` date DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_cv`
--

CREATE TABLE `profile_cv` (
  `profile_id` bigint NOT NULL,
  `attachment_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_enrolled_program`
--

CREATE TABLE `profile_enrolled_program` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `program_faculty_id` bigint DEFAULT NULL,
  `university` bigint DEFAULT NULL,
  `another_university` varchar(256) DEFAULT NULL,
  `country_id` bigint DEFAULT NULL,
  `state_id` int DEFAULT NULL,
  `city_id` bigint DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_graduate_program`
--

CREATE TABLE `profile_graduate_program` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `program_faculty_id` bigint DEFAULT NULL,
  `title` varchar(256) DEFAULT NULL,
  `endDate` date DEFAULT NULL,
  `university` bigint DEFAULT NULL,
  `another_university` varchar(256) DEFAULT NULL,
  `country_id` bigint DEFAULT NULL,
  `state_id` int DEFAULT NULL,
  `city_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_info_permissions`
--

CREATE TABLE `profile_info_permissions` (
  `profile_id` bigint NOT NULL,
  `permission` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_interest_areas`
--

CREATE TABLE `profile_interest_areas` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `area` bigint NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_language`
--

CREATE TABLE `profile_language` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `language` bigint NOT NULL,
  `level` bigint DEFAULT NULL,
  `level_write` bigint DEFAULT NULL,
  `level_listen` bigint DEFAULT NULL,
  `level_read` bigint DEFAULT NULL,
  `certification_exam` bit(1) DEFAULT b'0',
  `certification_exam_name` varchar(250) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_other_studies`
--

CREATE TABLE `profile_other_studies` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `study_name` varchar(300) NOT NULL,
  `study_institution` varchar(250) NOT NULL,
  `study_year` smallint NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_profile_version`
--

CREATE TABLE `profile_profile_version` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `profile_name` varchar(150) NOT NULL,
  `profile_text` text NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_program_extra_info`
--

CREATE TABLE `profile_program_extra_info` (
  `id` bigint NOT NULL,
  `enrolled_program_id` bigint NOT NULL,
  `according_credit_semester` float DEFAULT NULL,
  `enrolled` bit(1) DEFAULT b'0',
  `approved_courses` text,
  `current_courses` text,
  `approved_credits` varchar(100) DEFAULT NULL,
  `can_practice` bit(1) DEFAULT b'0',
  `cumulative_average` float DEFAULT NULL,
  `disciplinary_suspension` bit(1) DEFAULT NULL,
  `total_credits` int DEFAULT NULL,
  `taken_courses` text,
  `current_practices_credits` int DEFAULT NULL,
  `approved_practices_credits` int DEFAULT NULL,
  `current_required_credits` int DEFAULT NULL,
  `approved_required_credits` int DEFAULT NULL,
  `current_essencial_credits` int DEFAULT NULL,
  `approved_essencial_credits` int DEFAULT NULL,
  `current_elective_credits` int DEFAULT NULL,
  `approved_elective_credits` int DEFAULT NULL,
  `current_elective_hm_credits` int DEFAULT NULL,
  `approved_elective_hm_credits` int DEFAULT NULL,
  `current_comp_credits` int DEFAULT NULL,
  `approved_comp_credits` int DEFAULT NULL,
  `avg_taken_credits` float DEFAULT NULL,
  `avg_approved_credits` float DEFAULT NULL,
  `total_required_credits` int DEFAULT NULL,
  `current_credits` int DEFAULT NULL,
  `last_update_info` datetime DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_references`
--

CREATE TABLE `profile_references` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `firstname` varchar(100) NOT NULL,
  `lastname` varchar(100) NOT NULL,
  `ocuppation` varchar(100) NOT NULL,
  `phone` varchar(100) NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_skill`
--

CREATE TABLE `profile_skill` (
  `id` bigint NOT NULL,
  `profile_id` bigint NOT NULL,
  `skill_id` bigint NOT NULL,
  `experience_years` tinyint NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_supports`
--

CREATE TABLE `profile_supports` (
  `profile_id` bigint NOT NULL,
  `attachment_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `profile_work_experiences`
--

CREATE TABLE `profile_work_experiences` (
  `id` bigint UNSIGNED NOT NULL,
  `profile_id` bigint NOT NULL DEFAULT '0',
  `experience_type` varchar(50) DEFAULT 'JOB_EXP',
  `profile_text` text,
  `company_name` varchar(256) DEFAULT NULL,
  `company_sector` bigint DEFAULT NULL,
  `job_title` varchar(250) DEFAULT NULL,
  `profession` varchar(250) DEFAULT NULL,
  `contact` varchar(100) DEFAULT NULL,
  `achievements` text,
  `activities` text,
  `investigation_line` varchar(250) DEFAULT NULL,
  `course` varchar(250) DEFAULT NULL,
  `country_id` bigint DEFAULT NULL,
  `state_id` int DEFAULT NULL,
  `city_id` bigint DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `no_end_date` bit(1) DEFAULT NULL,
  `creation_date` datetime NOT NULL,
  `update_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `program`
--

CREATE TABLE `program` (
  `id` bigint NOT NULL,
  `code` varchar(100) DEFAULT '',
  `name` varchar(100) NOT NULL,
  `level` varchar(100) NOT NULL,
  `label_level` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `type_practice_id` bigint DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `programs_type_practices`
--

CREATE TABLE `programs_type_practices` (
  `id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `type_practice_id` bigint NOT NULL,
  `program_faculty_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `program_all`
--

CREATE TABLE `program_all` (
  `id` bigint NOT NULL,
  `code` varchar(100) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `level` varchar(100) NOT NULL,
  `label_level` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `type_practice_id` bigint DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `program_faculty`
--

CREATE TABLE `program_faculty` (
  `program_faculty_id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `faculty_id` int NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `snies` varchar(30) DEFAULT NULL,
  `cost_centre` varchar(30) DEFAULT NULL,
  `official_registration` varchar(100) DEFAULT NULL,
  `practice_duration` varchar(255) DEFAULT NULL,
  `official_registration_date` date DEFAULT NULL,
  `status` varchar(25) NOT NULL DEFAULT 'ACTIVE',
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_creator` varchar(150) NOT NULL DEFAULT 'superadmin',
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `resullist`
--

CREATE TABLE `resullist` (
  `nombre` varchar(255) DEFAULT NULL,
  `ctry` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `role`
--

CREATE TABLE `role` (
  `id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `url_dashboard` varchar(512) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `role_access_opportunity_administrator`
--

CREATE TABLE `role_access_opportunity_administrator` (
  `role_id` bigint NOT NULL,
  `access_opportunity_administrator_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role_id` bigint NOT NULL,
  `permission` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `rss_authorization`
--

CREATE TABLE `rss_authorization` (
  `id` int NOT NULL,
  `token` varchar(500) DEFAULT NULL,
  `filters` text,
  `fields` text,
  `description` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `schema_version`
--

CREATE TABLE `schema_version` (
  `version_rank` int NOT NULL,
  `installed_rank` int NOT NULL,
  `version` varchar(50) NOT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time` int NOT NULL,
  `success` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `schema_version_old`
--

CREATE TABLE `schema_version_old` (
  `installed_rank` int NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time` int NOT NULL,
  `success` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `skill`
--

CREATE TABLE `skill` (
  `id` bigint NOT NULL,
  `name` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `state`
--

CREATE TABLE `state` (
  `id` int NOT NULL,
  `name` varchar(30) NOT NULL,
  `dian_code` varchar(3) DEFAULT NULL,
  `country_id` bigint NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `states_authorized_practice`
--

CREATE TABLE `states_authorized_practice` (
  `id` bigint NOT NULL,
  `value` varchar(100) NOT NULL,
  `status` varchar(100) NOT NULL,
  `template_email` text,
  `has_notification` bit(1) DEFAULT NULL,
  `need_comment` bit(1) DEFAULT NULL,
  `recipients_search_types` varchar(100) DEFAULT NULL,
  `value_recipients_search` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `state_trancision_authorized_practice`
--

CREATE TABLE `state_trancision_authorized_practice` (
  `id` bigint NOT NULL,
  `statesAuthorizedPractice_id` bigint NOT NULL,
  `statesAuthorizedPractice_next_id` bigint NOT NULL,
  `status` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `study_working`
--

CREATE TABLE `study_working` (
  `study_working_id` bigint NOT NULL,
  `company_name_is_confidentiality` bit(1) DEFAULT b'0',
  `dedication_hours` bigint DEFAULT NULL,
  `remuneration_hour_per_week` bigint DEFAULT NULL,
  `contract_type` bigint DEFAULT NULL,
  `category` bigint DEFAULT NULL,
  `period_sw` bigint DEFAULT NULL,
  `cumulative_average` float DEFAULT '0',
  `course` bigint DEFAULT NULL,
  `teacher_responsable` varchar(120) DEFAULT '',
  `monitoring_group` tinyint(1) DEFAULT NULL,
  `is_doc_required` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `summary_bulk_mail`
--

CREATE TABLE `summary_bulk_mail` (
  `id` bigint UNSIGNED NOT NULL,
  `recipients` varchar(100) NOT NULL,
  `notification` varchar(50) NOT NULL,
  `json_object` text NOT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `t`
--

CREATE TABLE `t` (
  `txt` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `temp_postulant_to_notify`
--

CREATE TABLE `temp_postulant_to_notify` (
  `id` int UNSIGNED NOT NULL,
  `email` varchar(200) DEFAULT NULL,
  `offer_id` bigint DEFAULT NULL,
  `opportunity_type` varchar(50) DEFAULT NULL,
  `job_title` varchar(200) DEFAULT NULL,
  `programs` text,
  `functions` text,
  `company` varchar(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tracing_monitoring`
--

CREATE TABLE `tracing_monitoring` (
  `tracing_monitoring_id` bigint NOT NULL,
  `monitoring_legalized_id` bigint NOT NULL,
  `document_final_tracing` bigint DEFAULT NULL,
  `tracing_status` varchar(30) NOT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NULL DEFAULT NULL,
  `summary` varchar(550) DEFAULT NULL,
  `quantitative_note` varchar(45) DEFAULT NULL,
  `qualitative_note` varchar(45) DEFAULT NULL,
  `create_experience_after_finished` bit(1) DEFAULT b'0',
  `finished_by_monitor` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tracing_practices`
--

CREATE TABLE `tracing_practices` (
  `tracing_practice_id` bigint NOT NULL,
  `academic_practice_legalized_id` bigint NOT NULL,
  `document_final_tracing` bigint DEFAULT NULL,
  `boss_certification_practice` bigint DEFAULT NULL,
  `qualitative_note` varchar(20) DEFAULT NULL,
  `quantitative_note` float(3,2) DEFAULT NULL,
  `student_company_note` tinyint DEFAULT '0',
  `student_faculty_note` tinyint DEFAULT '0',
  `student_monitor_note` tinyint DEFAULT '0',
  `tracing_status` varchar(30) NOT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_creation` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_updater` varchar(100) DEFAULT NULL,
  `date_updater` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tracking_schedule`
--

CREATE TABLE `tracking_schedule` (
  `id` bigint NOT NULL,
  `practice_plan_id` bigint NOT NULL,
  `tracking_type` bigint NOT NULL,
  `activity_type` bigint NOT NULL,
  `date` date NOT NULL,
  `weighing` float DEFAULT NULL,
  `product_to_deliver` varchar(250) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `user_creator` varchar(100) NOT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user`
--

CREATE TABLE `user` (
  `id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `alternate_user_name` varchar(100) DEFAULT NULL,
  `password_hash` varchar(64) DEFAULT NULL,
  `it_has_encryption_in_SHA256` bit(1) DEFAULT b'0',
  `personal_email` varchar(100) DEFAULT NULL,
  `movil` varchar(20) DEFAULT NULL,
  `position` varchar(150) DEFAULT '',
  `phone` varchar(100) DEFAULT NULL,
  `extent` varchar(100) DEFAULT NULL,
  `accept_terms` bit(1) NOT NULL,
  `date_acceptance_terms` datetime DEFAULT NULL,
  `status` varchar(100) NOT NULL,
  `date_creation` datetime DEFAULT NULL,
  `user_creator` varchar(100) DEFAULT NULL,
  `date_update` datetime DEFAULT NULL,
  `user_updater` varchar(100) DEFAULT NULL,
  `identification` varchar(150) DEFAULT NULL,
  `auth_type` varchar(255) NOT NULL,
  `password_reset_key_id` bigint DEFAULT NULL,
  `is_super_admin` bit(1) NOT NULL DEFAULT b'0',
  `date_registration` datetime DEFAULT NULL,
  `date_last_load_client` datetime DEFAULT NULL,
  `activate_after_login` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_branch`
--

CREATE TABLE `user_branch` (
  `user_id` bigint NOT NULL COMMENT 'identificador de la tabla usuarios',
  `branch_id` bigint NOT NULL COMMENT 'identificador de la tabla sedes'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Relaciona los usuarios a muchas sedes';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_monitoring_tracing`
--

CREATE TABLE `user_monitoring_tracing` (
  `id` bigint NOT NULL,
  `tracing_monitoring_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_program`
--

CREATE TABLE `user_program` (
  `user_id` bigint NOT NULL,
  `program_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_role`
--

CREATE TABLE `user_role` (
  `user_id` bigint NOT NULL,
  `role_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_tracing`
--

CREATE TABLE `user_tracing` (
  `id` bigint NOT NULL,
  `tracing_practice_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `academic_period`
--
ALTER TABLE `academic_period`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `academic_practice`
--
ALTER TABLE `academic_practice`
  ADD PRIMARY KEY (`academic_practice_id`),
  ADD KEY `fk_academic_practice_dedication` (`dedication`),
  ADD KEY `fk_academic_practice_contract_type` (`contract_type`),
  ADD KEY `fk_academic_practice_country` (`country`),
  ADD KEY `fk_academic_practice_period` (`period`),
  ADD KEY `fk_item_job_area` (`job_area`),
  ADD KEY `fk_attachment_req_doc` (`required_document`),
  ADD KEY `fk_attachment_req_doc_2` (`required_document_2`),
  ADD KEY `fk_attachment_req_doc_3` (`required_document_3`);

--
-- Indices de la tabla `academic_practice_legalized`
--
ALTER TABLE `academic_practice_legalized`
  ADD PRIMARY KEY (`academic_practice_legalized_id`),
  ADD UNIQUE KEY `apluuid_unique` (`uuid`),
  ADD KEY `fk_offer_commes` (`academic_practice_id`),
  ADD KEY `fk_obtain_practice_prc_leg` (`obtain_practice`),
  ADD KEY `fk_boss_information_prc_leg` (`boss_apl`),
  ADD KEY `fk_company_legalized_prc_leg` (`company_apl`),
  ADD KEY `fk_postulant_practitioner_prc_leg` (`postulant_apl`),
  ADD KEY `fk_program_legalized_prc_leg` (`program_apl`),
  ADD KEY `fk_academic_period_apl` (`academic_period_apl`),
  ADD KEY `fk_city_prc_leg` (`city_apl`),
  ADD KEY `fk_contract_type_prc_leg` (`contract_type_apl`),
  ADD KEY `fk_country_prc_leg` (`country_apl`),
  ADD KEY `fk_dedication_hour_week_prc_leg` (`dedication_hour_week_apl`),
  ADD KEY `fk_function_prc_leg` (`function`),
  ADD KEY `fk_practice_type_prc_leg` (`practice_type`),
  ADD KEY `FK_academic_practice_legalized_item` (`practice_type_authorization`),
  ADD KEY `FK_academic_practice_legalized_user_tutor` (`user_tutor`),
  ADD KEY `fk_item_t_arl_apl` (`arl`),
  ADD KEY `fk_apl_user` (`user_tutor_2`),
  ADD KEY `Fk_faculty_apl_faculty` (`faculty_apl`);

--
-- Indices de la tabla `academic_practice_opportunity_language`
--
ALTER TABLE `academic_practice_opportunity_language`
  ADD KEY `fk_academic_practice_opportunity_language_academic_practice` (`academic_practice_id`),
  ADD KEY `fk_academic_practice_opportunity_language_opportunity_language` (`opportunity_language_id`);

--
-- Indices de la tabla `academic_practice_student`
--
ALTER TABLE `academic_practice_student`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `program_id_student_id_period_id_practice_id` (`program_id`,`student_id`,`period_id`,`practice_id`),
  ADD KEY `fk_practice_student_program_idx` (`program_id`),
  ADD KEY `fk_practice_student_student_idx` (`student_id`),
  ADD KEY `fk_status_authorized` (`status_id`),
  ADD KEY `fk_academic_period` (`period_id`),
  ADD KEY `fk_parametric_message` (`parametric_message_id`),
  ADD KEY `FK_academic_practice_student_item` (`practice_id`),
  ADD KEY `fk_practice_student_program_faculty` (`program_faculty_id`);

--
-- Indices de la tabla `academic_rules`
--
ALTER TABLE `academic_rules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_academic_rules_item_academic_var` (`academic_var`),
  ADD KEY `fk_academic_rules_item_operator` (`operator`),
  ADD KEY `fk_academic_rules_item_conector` (`conector`),
  ADD KEY `fk_academic_rules_item_type_practice` (`type_practice`),
  ADD KEY `fk_academic_rules_program_program_id` (`program_id`);

--
-- Indices de la tabla `access_opportunity_administrator`
--
ALTER TABLE `access_opportunity_administrator`
  ADD PRIMARY KEY (`access_opportunity_administrator_id`);

--
-- Indices de la tabla `access_opportunity_postulant`
--
ALTER TABLE `access_opportunity_postulant`
  ADD PRIMARY KEY (`access_opportunity_postulant_id`);

--
-- Indices de la tabla `access_opportunity_type`
--
ALTER TABLE `access_opportunity_type`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `access_postulant_practice`
--
ALTER TABLE `access_postulant_practice`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_access_postulant_practice_period` (`period_id`),
  ADD KEY `FK_access_postulant_practice_faculty` (`faculty_id`);

--
-- Indices de la tabla `access_postulant_practice_program`
--
ALTER TABLE `access_postulant_practice_program`
  ADD PRIMARY KEY (`access_postulant_practice_id`,`program_faculty_id`),
  ADD KEY `FK_access_post_practice_program_program` (`program_faculty_id`);

--
-- Indices de la tabla `activities_logs`
--
ALTER TABLE `activities_logs`
  ADD PRIMARY KEY (`activity_log_id`),
  ADD UNIQUE KEY `aluuid_unique` (`uuid`),
  ADD KEY `fk_attachment_log_1` (`first_attachment`),
  ADD KEY `fk_attachment_log_2` (`second_attachment`),
  ADD KEY `fk_monitoring_logs` (`monitoring_activity_id`),
  ADD KEY `fk_tracing_logs` (`tracing_practice_id`),
  ADD KEY `FK_activity_log_medium` (`reporting_medium`),
  ADD KEY `FK_activity_log_plan` (`practice_plan_id`),
  ADD KEY `FK_activity_log_schedule` (`tracking_schedule_id`);

--
-- Indices de la tabla `alert_configuration`
--
ALTER TABLE `alert_configuration`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `allowed_extensions`
--
ALTER TABLE `allowed_extensions`
  ADD PRIMARY KEY (`document_practice_definition_id`,`item_id`),
  ADD KEY `fk_extensions_item` (`item_id`);

--
-- Indices de la tabla `application_info_transnational`
--
ALTER TABLE `application_info_transnational`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK__info_trans_opportunity_application` (`application_id`),
  ADD KEY `FK__info_trans_country` (`country_id`),
  ADD KEY `FK__info_trans_city` (`city_id`),
  ADD KEY `FK__info_trans_item` (`currency`);

--
-- Indices de la tabla `approval_documents`
--
ALTER TABLE `approval_documents`
  ADD PRIMARY KEY (`approval_document_id`),
  ADD KEY `fk_administer_prc_leg2` (`user_id`),
  ADD KEY `fk_approval_document` (`document_practice_definition_id`,`academic_practice_legalized_id`);

--
-- Indices de la tabla `approval_monitoring_documents`
--
ALTER TABLE `approval_monitoring_documents`
  ADD PRIMARY KEY (`approval_document_id`),
  ADD KEY `fk_administer_mon_leg2` (`user_id`),
  ADD KEY `fk_approval_mon_document` (`document_monitoring_definition_id`,`monitoring_legalized_id`);

--
-- Indices de la tabla `approval_program_academic_practice`
--
ALTER TABLE `approval_program_academic_practice`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_approval_program_academic_practice_program` (`program_id`),
  ADD KEY `fk_approval_program_academic_practice_opportunity` (`academic_practice_id`);

--
-- Indices de la tabla `attachment`
--
ALTER TABLE `attachment`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `authorized_study_working`
--
ALTER TABLE `authorized_study_working`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_authorized_study_working_postulant` (`postulant_id`);

--
-- Indices de la tabla `authorized_study_working_log`
--
ALTER TABLE `authorized_study_working_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_authorized_study_working_postulant` (`postulant_id`);

--
-- Indices de la tabla `branch`
--
ALTER TABLE `branch`
  ADD PRIMARY KEY (`branch_id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `fk_country` (`country`),
  ADD KEY `fk_city` (`city`),
  ADD KEY `fk_active_directory_item` (`active_directory`);

--
-- Indices de la tabla `bulk_load`
--
ALTER TABLE `bulk_load`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `bulk_load_log`
--
ALTER TABLE `bulk_load_log`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `change_status_approval_program_academic_practice`
--
ALTER TABLE `change_status_approval_program_academic_practice`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_change_status_approval_program_academic_practice_program` (`program_id`),
  ADD KEY `fk_change_status_approval_program_academic_practice_opportunity` (`academic_practice_id`);

--
-- Indices de la tabla `change_status_authorized_practice`
--
ALTER TABLE `change_status_authorized_practice`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_change_status_authorized_practice_authorized_practice` (`authorized_practice_id`),
  ADD KEY `fk_change_status_authorized_practice_before` (`status_before`),
  ADD KEY `fk_change_status_authorized_practice_after` (`status_after`);

--
-- Indices de la tabla `change_status_company`
--
ALTER TABLE `change_status_company`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_change_status_company_company` (`company_id`);

--
-- Indices de la tabla `change_status_legalized`
--
ALTER TABLE `change_status_legalized`
  ADD PRIMARY KEY (`change_status_legalized_id`),
  ADD KEY `fk_user_change_status` (`user_id`),
  ADD KEY `fk_change_status_apl` (`academic_practice_legalized_id`);

--
-- Indices de la tabla `change_status_monitoring_legalized`
--
ALTER TABLE `change_status_monitoring_legalized`
  ADD PRIMARY KEY (`change_status_monitoring_legalized_id`),
  ADD KEY `fk_user_ml_change_status` (`user_id`),
  ADD KEY `fk_change_status_ml` (`monitoring_legalized_id`);

--
-- Indices de la tabla `change_status_monitoring_plan`
--
ALTER TABLE `change_status_monitoring_plan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_change_status_mp` (`user_id`),
  ADD KEY `fk_change_status_mp` (`monitoring_plan_id`);

--
-- Indices de la tabla `change_status_opportunity`
--
ALTER TABLE `change_status_opportunity`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_change_status_opportunity_opportunity` (`opportunity_id`);

--
-- Indices de la tabla `change_status_practice_plan`
--
ALTER TABLE `change_status_practice_plan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_change_status_pp` (`user_id`),
  ADD KEY `fk_change_status_pp` (`practice_plan_id`);

--
-- Indices de la tabla `change_status_user`
--
ALTER TABLE `change_status_user`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_id_idx` (`user_id`);

--
-- Indices de la tabla `city`
--
ALTER TABLE `city`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK1_state_id` (`state_id`);

--
-- Indices de la tabla `company`
--
ALTER TABLE `company`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_company_country` (`country`),
  ADD KEY `fk_company_city` (`city`),
  ADD KEY `fk_company_identification_type` (`identification_type`),
  ADD KEY `fk_company_business_sector` (`business_sector`),
  ADD KEY `fk_company_logo` (`logo_id`),
  ADD KEY `FK_company_chamber_attachment` (`chamber_commerce_cert`),
  ADD KEY `FK_company_agency_attachment` (`agency_head_hunter_cert`),
  ADD KEY `fk_item_sector` (`sector`),
  ADD KEY `fk_item_snies_sector` (`snies_sector`),
  ADD KEY `fk_item_size` (`size`),
  ADD KEY `fk_item_resource_type` (`resources_type`),
  ADD KEY `fk_item_arl` (`arl`),
  ADD KEY `fk_attachment_rut` (`rut`),
  ADD KEY `fk_item_lr_identification` (`lr_identification_type`);

--
-- Indices de la tabla `company_black_list`
--
ALTER TABLE `company_black_list`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `company_document`
--
ALTER TABLE `company_document`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_company_document_company` (`company_id`),
  ADD KEY `FK_company_document_attachment` (`attachment_id`),
  ADD KEY `FK_company_document_item_doc_type` (`document_type`),
  ADD KEY `FK_company_document_item_agg_type` (`aggrement_type`);

--
-- Indices de la tabla `company_office`
--
ALTER TABLE `company_office`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_company_office_company` (`company`),
  ADD KEY `fk_company_office_country` (`country`),
  ADD KEY `fk_company_office_city` (`city`);

--
-- Indices de la tabla `company_user`
--
ALTER TABLE `company_user`
  ADD PRIMARY KEY (`company_user_id`),
  ADD KEY `fk_company_user_company` (`company_id`),
  ADD KEY `fk_country_company_user` (`country`),
  ADD KEY `fk_city_company_user` (`city`);

--
-- Indices de la tabla `country`
--
ALTER TABLE `country`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `course`
--
ALTER TABLE `course`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_course_level` (`level`),
  ADD KEY `fk_course_faculty` (`faculty`),
  ADD KEY `fk_course_area` (`area`);

--
-- Indices de la tabla `course_temp`
--
ALTER TABLE `course_temp`
  ADD KEY `idx_course_temp_code` (`code`);

--
-- Indices de la tabla `dashboard_opportunity`
--
ALTER TABLE `dashboard_opportunity`
  ADD KEY `OPORTUNIDAD_ID` (`OPORTUNIDAD_ID`);

--
-- Indices de la tabla `dashboard_opportunity_aplication`
--
ALTER TABLE `dashboard_opportunity_aplication`
  ADD KEY `OPORTUNIDAD_ID` (`OPORTUNIDAD_ID`) USING BTREE;

--
-- Indices de la tabla `document_creation_log`
--
ALTER TABLE `document_creation_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_document_log_user` (`user_id`);

--
-- Indices de la tabla `document_monitoring`
--
ALTER TABLE `document_monitoring`
  ADD PRIMARY KEY (`document_monitoring_definition_id`,`monitoring_legalized_id`),
  ADD KEY `fk_document_mon_attached` (`document_attached_id`),
  ADD KEY `fk_document_monitoring` (`monitoring_legalized_id`);

--
-- Indices de la tabla `document_monitoring_definition`
--
ALTER TABLE `document_monitoring_definition`
  ADD PRIMARY KEY (`document_monitoring_definition_id`),
  ADD KEY `fk_mon_document_type` (`document_type_id`),
  ADD KEY `fk_mon_model_attached` (`model_attached_id`),
  ADD KEY `fk_mon_template_attached` (`template_attached_id`);

--
-- Indices de la tabla `document_practice`
--
ALTER TABLE `document_practice`
  ADD PRIMARY KEY (`document_practice_definition_id`,`academic_practice_legalized_id`),
  ADD KEY `fk_document_attached` (`document_attached_id`),
  ADD KEY `fk_document_practice_apl` (`academic_practice_legalized_id`);

--
-- Indices de la tabla `document_practice_definition`
--
ALTER TABLE `document_practice_definition`
  ADD PRIMARY KEY (`document_practice_definition_id`),
  ADD KEY `fk_document_type` (`document_type_id`),
  ADD KEY `fk_practice_type_prc_def` (`practice_type`),
  ADD KEY `fk_model_attached` (`model_attached_id`),
  ADD KEY `fk_template_attached` (`template_attached_id`);

--
-- Indices de la tabla `document_practice_def_program`
--
ALTER TABLE `document_practice_def_program`
  ADD PRIMARY KEY (`document_practice_definition_id`,`program_faculty_id`),
  ADD KEY `FK_doc_practice_def_prog_program` (`program_faculty_id`);

--
-- Indices de la tabla `dynamic_list`
--
ALTER TABLE `dynamic_list`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name_UNIQUE` (`name`),
  ADD UNIQUE KEY `id_UNIQUE` (`id`);

--
-- Indices de la tabla `evaluations`
--
ALTER TABLE `evaluations`
  ADD PRIMARY KEY (`evaluation_id`),
  ADD KEY `FK_evaluations_academic_period` (`period`),
  ADD KEY `FK_evaluations_item` (`type_survey`),
  ADD KEY `FK_evaluation_practice` (`practice_type`),
  ADD KEY `FK_evaluation_faculty` (`faculty_id`);

--
-- Indices de la tabla `evaluation_program`
--
ALTER TABLE `evaluation_program`
  ADD PRIMARY KEY (`evaluation_id`,`program_faculty_id`),
  ADD KEY `FK_evaluation_program_program` (`program_faculty_id`);

--
-- Indices de la tabla `faculty`
--
ALTER TABLE `faculty`
  ADD PRIMARY KEY (`faculty_id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `FK_faculty_branch` (`branch_id`),
  ADD KEY `fk_item_ident_type_signer` (`identification_type_signer`),
  ADD KEY `fk_city_ident_from_signer` (`identification_from_signer`);

--
-- Indices de la tabla `item`
--
ALTER TABLE `item`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_parentitem_idx` (`parent_id`),
  ADD KEY `fk_list_idx` (`list_id`);

--
-- Indices de la tabla `item_academic_practice_cities`
--
ALTER TABLE `item_academic_practice_cities`
  ADD KEY `fk_academic_practice_cities_academic_practice` (`academic_practice_id`),
  ADD KEY `fk_academic_practice_cities_item` (`city_id`);

--
-- Indices de la tabla `item_academic_practice_emotional_salary`
--
ALTER TABLE `item_academic_practice_emotional_salary`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_emotional_pr_item` (`item_id`),
  ADD KEY `FK_emotional_pr_academic_practice` (`academic_practice_id`);

--
-- Indices de la tabla `item_job_offer_cities`
--
ALTER TABLE `item_job_offer_cities`
  ADD KEY `fk_job_offer_cities_job_offer` (`job_offer_id`),
  ADD KEY `fk_job_offer_cities_item` (`city_id`);

--
-- Indices de la tabla `item_job_offer_emotional_salary`
--
ALTER TABLE `item_job_offer_emotional_salary`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK__salary_emotional_job_offer` (`job_offer_id`),
  ADD KEY `FK__salary_emotional_item` (`item_id`);

--
-- Indices de la tabla `job_offer`
--
ALTER TABLE `job_offer`
  ADD PRIMARY KEY (`job_offer_id`),
  ADD KEY `fk_job_offer_opportunity` (`job_offer_id`),
  ADD KEY `fk_job_offer_years_experience` (`years_experience`),
  ADD KEY `fk_job_offer_dedication` (`dedication`),
  ADD KEY `fk_job_offer_contract_type` (`contract_type`),
  ADD KEY `fk_job_offer_country` (`country`),
  ADD KEY `fk_job_offer_position_level` (`position_level`);

--
-- Indices de la tabla `job_offer_opportunity_language`
--
ALTER TABLE `job_offer_opportunity_language`
  ADD KEY `fk_job_offer_opportunity_language_job_offer` (`job_offer_id`),
  ADD KEY `fk_job_offer_opportunity_language_opportunity_language` (`opportunity_language_id`);

--
-- Indices de la tabla `job_offer_skills`
--
ALTER TABLE `job_offer_skills`
  ADD KEY `fk_job_offer_skills_job_offer` (`job_offer_id`),
  ADD KEY `fk_job_offer_skills_skills` (`skill_id`);

--
-- Indices de la tabla `licensing_configuration`
--
ALTER TABLE `licensing_configuration`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `menu_page`
--
ALTER TABLE `menu_page`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `monitoring_activities_definitions`
--
ALTER TABLE `monitoring_activities_definitions`
  ADD PRIMARY KEY (`activity_id`),
  ADD KEY `FK_monitoring_activities_definitions_attachment` (`template_attached`);

--
-- Indices de la tabla `monitoring_activity_assistance`
--
ALTER TABLE `monitoring_activity_assistance`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_assistance_activity_log` (`activity_log_id`),
  ADD KEY `fk_program_activity_log` (`student_program_id`);

--
-- Indices de la tabla `monitoring_activity_log`
--
ALTER TABLE `monitoring_activity_log`
  ADD PRIMARY KEY (`activity_log_id`),
  ADD KEY `fk_mon_attachment_log_1` (`first_attachment`),
  ADD KEY `fk_mon_attachment_log_2` (`second_attachment`),
  ADD KEY `fk_tracing__mon_logs` (`tracing_monitoring_id`),
  ADD KEY `FK_activity_mon_log_plan` (`monitoring_plan_id`),
  ADD KEY `FK_activity_mon_log_schedule` (`tracing_monitoring_id`),
  ADD KEY `fk_ml_item_activity_type` (`activity_type`);

--
-- Indices de la tabla `monitoring_allowed_extensions`
--
ALTER TABLE `monitoring_allowed_extensions`
  ADD PRIMARY KEY (`document_monitoring_definition_id`,`item_id`),
  ADD KEY `fk_extensions_mon_item` (`item_id`);

--
-- Indices de la tabla `monitoring_evaluation`
--
ALTER TABLE `monitoring_evaluation`
  ADD PRIMARY KEY (`evaluation_id`),
  ADD KEY `FK_mon_evaluation_academic_period` (`period`),
  ADD KEY `FK_mon_evaluation_item` (`type_survey`),
  ADD KEY `FK_mon_evaluation_faculty` (`faculty_id`);

--
-- Indices de la tabla `monitoring_evaluation_category`
--
ALTER TABLE `monitoring_evaluation_category`
  ADD PRIMARY KEY (`evaluation_id`,`category`),
  ADD KEY `FK_mon_evaluation_category_category` (`category`);

--
-- Indices de la tabla `monitoring_evaluation_program`
--
ALTER TABLE `monitoring_evaluation_program`
  ADD PRIMARY KEY (`evaluation_id`,`program_faculty_id`),
  ADD KEY `FK_mon_evaluation_program_program` (`program_faculty_id`);

--
-- Indices de la tabla `monitoring_legalized`
--
ALTER TABLE `monitoring_legalized`
  ADD PRIMARY KEY (`monitoring_legalized_id`),
  ADD KEY `fk_monitoring_commes` (`study_working_id`),
  ADD KEY `fk_postulant_monitor_leg` (`postulant_ml`),
  ADD KEY `fk_program_legalized_mon_leg` (`program_ml`),
  ADD KEY `fk_academic_period_ml` (`period_ml`),
  ADD KEY `fk_dedication_hour_leg` (`dedication_hours`),
  ADD KEY `FK_monitoring_legalized_item_1` (`category`),
  ADD KEY `FK_monitoring_legalized_item_2` (`remuneration_hour_per_week`),
  ADD KEY `FK_monitoring_faculty` (`faculty_ml`),
  ADD KEY `fk_coordinator_idx` (`user_coordinator`),
  ADD KEY `fk_teacher_idx` (`user_teacher`),
  ADD KEY `fk_ml_item_account_type` (`account_type`),
  ADD KEY `fk_ml_item_fin_bank` (`fin_bank`),
  ADD KEY `fk_ml_item_eps` (`eps`),
  ADD KEY `fk_ml_item_residence_area` (`residence_area`);

--
-- Indices de la tabla `monitoring_plan`
--
ALTER TABLE `monitoring_plan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_plan_monitoring_legalized` (`monitoring_legalized_id`),
  ADD KEY `FK_plan_mon_postulant` (`postulant_id`),
  ADD KEY `FK_plan_study_working` (`study_working_id`);

--
-- Indices de la tabla `monitoring_plan_schedule`
--
ALTER TABLE `monitoring_plan_schedule`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_schedule_practice_plan` (`monitoring_plan_id`);

--
-- Indices de la tabla `notification`
--
ALTER TABLE `notification`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `notification_log`
--
ALTER TABLE `notification_log`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `notification_user`
--
ALTER TABLE `notification_user`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_notification_user_user` (`user_id`);

--
-- Indices de la tabla `notification_user_bkp`
--
ALTER TABLE `notification_user_bkp`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_notification_user_bkp_user` (`user_id`);

--
-- Indices de la tabla `opportunity`
--
ALTER TABLE `opportunity`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ouuid_unique` (`uuid`),
  ADD KEY `fk_opportunity_company` (`company_id`),
  ADD KEY `fk_opportunity_branch` (`branch_id`);

--
-- Indices de la tabla `opportunity_application`
--
ALTER TABLE `opportunity_application`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `application_opp_post_uk` (`opportunity_id`,`postulant_id`),
  ADD UNIQUE KEY `oauuid_unique` (`uuid`),
  ADD KEY `application_opportunity_fk_idx` (`opportunity_id`),
  ADD KEY `application_postulant_fk_idx` (`postulant_id`),
  ADD KEY `application_cv_fk_idx` (`postulant_cv`),
  ADD KEY `fk_opportunity_application_document` (`opp_required_document`),
  ADD KEY `fk_item_t_identification_type` (`tutor_identification_type`),
  ADD KEY `fk_item_c_arl` (`company_arl`);

--
-- Indices de la tabla `opportunity_language`
--
ALTER TABLE `opportunity_language`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_opportunity_language_language` (`language_id`),
  ADD KEY `fk_opportunity_language_level` (`level_id`);

--
-- Indices de la tabla `opportunity_programs`
--
ALTER TABLE `opportunity_programs`
  ADD KEY `fk_opportunity_programs_opportunity` (`opportunity_id`),
  ADD KEY `fk_opportunity_programs_program` (`program_id`);

--
-- Indices de la tabla `pages`
--
ALTER TABLE `pages`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `parameter_configuration`
--
ALTER TABLE `parameter_configuration`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `parametric_message`
--
ALTER TABLE `parametric_message`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `password_reset_key`
--
ALTER TABLE `password_reset_key`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `postulant`
--
ALTER TABLE `postulant`
  ADD PRIMARY KEY (`postulant_id`),
  ADD KEY `fk_postulant_user` (`postulant_id`),
  ADD KEY `FK_postulant_country` (`country_birth_id`),
  ADD KEY `FK_postulant_state` (`state_birth_id`),
  ADD KEY `FK_postulant_city` (`city_birth_id`),
  ADD KEY `FK_postulant_country_2` (`country_residence_id`),
  ADD KEY `FK_postulant_state_2` (`state_residence_id`),
  ADD KEY `FK_postulant_city_2` (`city_residence_id`);

--
-- Indices de la tabla `postulant_profile`
--
ALTER TABLE `postulant_profile`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `postulant_id_UNIQUE` (`postulant_id`),
  ADD KEY `postulant_fk_idx` (`postulant_id`),
  ADD KEY `FK_postulant_profile_item` (`level_job`),
  ADD KEY `FK_postulant_profile_item_4` (`company_sector`);

--
-- Indices de la tabla `practice_boss`
--
ALTER TABLE `practice_boss`
  ADD PRIMARY KEY (`boss_id`),
  ADD KEY `FK_boss_identification_type` (`identification_type`);

--
-- Indices de la tabla `practice_evaluation`
--
ALTER TABLE `practice_evaluation`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_evaluation_apl` (`academic_practice_legalized_id`),
  ADD KEY `fk_evaluation_eval` (`evaluation_id`);

--
-- Indices de la tabla `practice_plan`
--
ALTER TABLE `practice_plan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_plan_practice_legalized` (`academic_practice_legalized_id`),
  ADD KEY `FK_plan_postulant` (`postulant_id`),
  ADD KEY `FK_plan_academic_practice` (`academic_practice_id`),
  ADD KEY `FK_plan_attachment` (`signed_document`);

--
-- Indices de la tabla `profile_awards`
--
ALTER TABLE `profile_awards`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_profile_awards_idx` (`profile_id`),
  ADD KEY `FK_item_profile_awards_idx` (`award_type`);

--
-- Indices de la tabla `profile_cv`
--
ALTER TABLE `profile_cv`
  ADD PRIMARY KEY (`profile_id`,`attachment_id`),
  ADD KEY `FK_attachment_profile_cv_idx` (`attachment_id`);

--
-- Indices de la tabla `profile_enrolled_program`
--
ALTER TABLE `profile_enrolled_program`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_program_profile_idx` (`profile_id`,`program_id`),
  ADD KEY `program_fk_idx` (`program_id`),
  ADD KEY `FK_profile_enrolled_program_item` (`university`),
  ADD KEY `FK_profile_enrolled_program_country` (`country_id`),
  ADD KEY `FK_profile_enrolled_program_state` (`state_id`),
  ADD KEY `FK_profile_enrolled_program_city` (`city_id`),
  ADD KEY `FK_profile_enrolled_program_faculty` (`program_faculty_id`);

--
-- Indices de la tabla `profile_graduate_program`
--
ALTER TABLE `profile_graduate_program`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `profile_id_program_id` (`profile_id`,`program_id`),
  ADD KEY `program_fk_idx` (`program_id`),
  ADD KEY `FK_profile_graduate_program_country` (`country_id`),
  ADD KEY `FK_profile_graduate_program_item` (`university`),
  ADD KEY `FK_profile_graduate_program_state` (`state_id`),
  ADD KEY `FK_profile_graduate_program_city` (`city_id`),
  ADD KEY `FK_profile_graduate_program_faculty` (`program_faculty_id`);

--
-- Indices de la tabla `profile_info_permissions`
--
ALTER TABLE `profile_info_permissions`
  ADD PRIMARY KEY (`profile_id`);

--
-- Indices de la tabla `profile_interest_areas`
--
ALTER TABLE `profile_interest_areas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_profile_interest_areas_idx` (`profile_id`),
  ADD KEY `FK_item_profile_interest_areas_idx` (`area`);

--
-- Indices de la tabla `profile_language`
--
ALTER TABLE `profile_language`
  ADD PRIMARY KEY (`id`),
  ADD KEY `profile_l_fk_idx` (`profile_id`),
  ADD KEY `lang_list_fk_idx` (`language`),
  ADD KEY `fk_item_profile_language_write` (`level_write`),
  ADD KEY `fk_item_profile_language_listen` (`level_listen`),
  ADD KEY `fk_item_profile_language_read` (`level_read`),
  ADD KEY `fk_item_profile_language_level` (`level`);

--
-- Indices de la tabla `profile_other_studies`
--
ALTER TABLE `profile_other_studies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_profile_other_studies_idx` (`profile_id`);

--
-- Indices de la tabla `profile_profile_version`
--
ALTER TABLE `profile_profile_version`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_profile_profile_version_idx` (`profile_id`);

--
-- Indices de la tabla `profile_program_extra_info`
--
ALTER TABLE `profile_program_extra_info`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `UQ_ENROLLED_PROGRAM` (`enrolled_program_id`),
  ADD KEY `FK_program_profile_extra_info_idx` (`enrolled_program_id`);

--
-- Indices de la tabla `profile_references`
--
ALTER TABLE `profile_references`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_references_idx` (`profile_id`);

--
-- Indices de la tabla `profile_skill`
--
ALTER TABLE `profile_skill`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_profile_profile_skill_idx` (`profile_id`),
  ADD KEY `FK_skill_profile_skill_idx` (`skill_id`);

--
-- Indices de la tabla `profile_supports`
--
ALTER TABLE `profile_supports`
  ADD PRIMARY KEY (`profile_id`,`attachment_id`),
  ADD KEY `FK_attachment_profile_supports_idx` (`attachment_id`);

--
-- Indices de la tabla `profile_work_experiences`
--
ALTER TABLE `profile_work_experiences`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK__country` (`country_id`),
  ADD KEY `FK__state` (`state_id`),
  ADD KEY `FK__city` (`city_id`),
  ADD KEY `FK__postulant_profile` (`profile_id`),
  ADD KEY `FK_profile_work_experiences_item` (`company_sector`);

--
-- Indices de la tabla `program`
--
ALTER TABLE `program`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `iu_program_code` (`code`),
  ADD KEY `FK_program_item` (`type_practice_id`);

--
-- Indices de la tabla `programs_type_practices`
--
ALTER TABLE `programs_type_practices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `type_practice_id` (`type_practice_id`,`program_faculty_id`),
  ADD KEY `FK__program` (`program_id`),
  ADD KEY `FK_program_faculty` (`program_faculty_id`);

--
-- Indices de la tabla `program_all`
--
ALTER TABLE `program_all`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `iu_program__all_code` (`code`),
  ADD KEY `FK_program_all_item` (`type_practice_id`);

--
-- Indices de la tabla `program_faculty`
--
ALTER TABLE `program_faculty`
  ADD PRIMARY KEY (`program_faculty_id`),
  ADD UNIQUE KEY `faculty_id_code` (`faculty_id`,`code`),
  ADD KEY `FK_program_faculty_program` (`program_id`),
  ADD KEY `FK_program_faculty_faculty` (`faculty_id`);

--
-- Indices de la tabla `role`
--
ALTER TABLE `role`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name_UNIQUE` (`name`);

--
-- Indices de la tabla `role_access_opportunity_administrator`
--
ALTER TABLE `role_access_opportunity_administrator`
  ADD KEY `fk_role_access_opportunity_administrator_role` (`role_id`),
  ADD KEY `fk_role_access_opportunity_administrator_administrator` (`access_opportunity_administrator_id`);

--
-- Indices de la tabla `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD KEY `FK_role_permissions_role` (`role_id`);

--
-- Indices de la tabla `rss_authorization`
--
ALTER TABLE `rss_authorization`
  ADD PRIMARY KEY (`id`),
  ADD KEY `token` (`token`(255));

--
-- Indices de la tabla `schema_version`
--
ALTER TABLE `schema_version`
  ADD PRIMARY KEY (`version`),
  ADD KEY `schema_version_vr_idx` (`version_rank`),
  ADD KEY `schema_version_ir_idx` (`installed_rank`),
  ADD KEY `schema_version_s_idx` (`success`);

--
-- Indices de la tabla `schema_version_old`
--
ALTER TABLE `schema_version_old`
  ADD PRIMARY KEY (`installed_rank`),
  ADD KEY `schema_version_s_idx` (`success`);

--
-- Indices de la tabla `skill`
--
ALTER TABLE `skill`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `state`
--
ALTER TABLE `state`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK1_country_id` (`country_id`);

--
-- Indices de la tabla `states_authorized_practice`
--
ALTER TABLE `states_authorized_practice`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `state_trancision_authorized_practice`
--
ALTER TABLE `state_trancision_authorized_practice`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_state_trancision_authorized_practice` (`statesAuthorizedPractice_id`),
  ADD KEY `fk_state_trancision_authorized_practice_next` (`statesAuthorizedPractice_next_id`);

--
-- Indices de la tabla `study_working`
--
ALTER TABLE `study_working`
  ADD PRIMARY KEY (`study_working_id`),
  ADD KEY `fk_study_working_item_contract_type` (`contract_type`),
  ADD KEY `fk_study_working_item_dedication_hours` (`dedication_hours`),
  ADD KEY `fk_study_working_item_remuneration` (`remuneration_hour_per_week`),
  ADD KEY `fk_sw_item_category` (`category`),
  ADD KEY `fk_sw_period` (`period_sw`),
  ADD KEY `fk_sw_course` (`course`);

--
-- Indices de la tabla `summary_bulk_mail`
--
ALTER TABLE `summary_bulk_mail`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `temp_postulant_to_notify`
--
ALTER TABLE `temp_postulant_to_notify`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `tracing_monitoring`
--
ALTER TABLE `tracing_monitoring`
  ADD PRIMARY KEY (`tracing_monitoring_id`),
  ADD KEY `fk_mon_tracing` (`monitoring_legalized_id`),
  ADD KEY `fk_tracing_monitoring_attachment` (`document_final_tracing`);

--
-- Indices de la tabla `tracing_practices`
--
ALTER TABLE `tracing_practices`
  ADD PRIMARY KEY (`tracing_practice_id`),
  ADD KEY `fk_apl_tracing2` (`academic_practice_legalized_id`),
  ADD KEY `fk_tracing_practice_attachment` (`document_final_tracing`),
  ADD KEY `FK_tracing_boss_certifcation_attch` (`boss_certification_practice`);

--
-- Indices de la tabla `tracking_schedule`
--
ALTER TABLE `tracking_schedule`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_schedule_practice_plan` (`practice_plan_id`),
  ADD KEY `FK_schedule_tracking_item` (`tracking_type`),
  ADD KEY `FK_schedule_activity_item` (`activity_type`);

--
-- Indices de la tabla `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_name_UNIQUE` (`user_name`),
  ADD UNIQUE KEY `iu_user_user_name` (`user_name`),
  ADD UNIQUE KEY `alternate_user_name` (`alternate_user_name`),
  ADD KEY `fk_user_password_reset_key` (`password_reset_key_id`);

--
-- Indices de la tabla `user_branch`
--
ALTER TABLE `user_branch`
  ADD KEY `user_id` (`user_id`),
  ADD KEY `location_id` (`branch_id`);

--
-- Indices de la tabla `user_monitoring_tracing`
--
ALTER TABLE `user_monitoring_tracing`
  ADD PRIMARY KEY (`id`,`tracing_monitoring_id`),
  ADD KEY `fk_user_monitoring_tracing` (`tracing_monitoring_id`);

--
-- Indices de la tabla `user_program`
--
ALTER TABLE `user_program`
  ADD KEY `fk_user_program_user` (`user_id`),
  ADD KEY `fk_user_program_program` (`program_id`);

--
-- Indices de la tabla `user_role`
--
ALTER TABLE `user_role`
  ADD KEY `fk_user_role_user` (`user_id`),
  ADD KEY `fk_user_role_role` (`role_id`);

--
-- Indices de la tabla `user_tracing`
--
ALTER TABLE `user_tracing`
  ADD PRIMARY KEY (`id`,`tracing_practice_id`),
  ADD KEY `fk_user_tracing_tracing` (`tracing_practice_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `academic_period`
--
ALTER TABLE `academic_period`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `academic_practice`
--
ALTER TABLE `academic_practice`
  MODIFY `academic_practice_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `academic_practice_legalized`
--
ALTER TABLE `academic_practice_legalized`
  MODIFY `academic_practice_legalized_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `academic_practice_student`
--
ALTER TABLE `academic_practice_student`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `academic_rules`
--
ALTER TABLE `academic_rules`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `access_opportunity_administrator`
--
ALTER TABLE `access_opportunity_administrator`
  MODIFY `access_opportunity_administrator_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `access_opportunity_postulant`
--
ALTER TABLE `access_opportunity_postulant`
  MODIFY `access_opportunity_postulant_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `access_opportunity_type`
--
ALTER TABLE `access_opportunity_type`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `access_postulant_practice`
--
ALTER TABLE `access_postulant_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `activities_logs`
--
ALTER TABLE `activities_logs`
  MODIFY `activity_log_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `alert_configuration`
--
ALTER TABLE `alert_configuration`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `application_info_transnational`
--
ALTER TABLE `application_info_transnational`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `approval_documents`
--
ALTER TABLE `approval_documents`
  MODIFY `approval_document_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `approval_monitoring_documents`
--
ALTER TABLE `approval_monitoring_documents`
  MODIFY `approval_document_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `approval_program_academic_practice`
--
ALTER TABLE `approval_program_academic_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `attachment`
--
ALTER TABLE `attachment`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `authorized_study_working`
--
ALTER TABLE `authorized_study_working`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `authorized_study_working_log`
--
ALTER TABLE `authorized_study_working_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `branch`
--
ALTER TABLE `branch`
  MODIFY `branch_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'identificador unico de la tabla';

--
-- AUTO_INCREMENT de la tabla `bulk_load`
--
ALTER TABLE `bulk_load`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `bulk_load_log`
--
ALTER TABLE `bulk_load_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_approval_program_academic_practice`
--
ALTER TABLE `change_status_approval_program_academic_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_authorized_practice`
--
ALTER TABLE `change_status_authorized_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_company`
--
ALTER TABLE `change_status_company`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_legalized`
--
ALTER TABLE `change_status_legalized`
  MODIFY `change_status_legalized_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_monitoring_legalized`
--
ALTER TABLE `change_status_monitoring_legalized`
  MODIFY `change_status_monitoring_legalized_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_monitoring_plan`
--
ALTER TABLE `change_status_monitoring_plan`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_opportunity`
--
ALTER TABLE `change_status_opportunity`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_practice_plan`
--
ALTER TABLE `change_status_practice_plan`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `change_status_user`
--
ALTER TABLE `change_status_user`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `city`
--
ALTER TABLE `city`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `company`
--
ALTER TABLE `company`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `company_black_list`
--
ALTER TABLE `company_black_list`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'identificador unico de la tabla';

--
-- AUTO_INCREMENT de la tabla `company_document`
--
ALTER TABLE `company_document`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `company_office`
--
ALTER TABLE `company_office`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `country`
--
ALTER TABLE `country`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `course`
--
ALTER TABLE `course`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `document_creation_log`
--
ALTER TABLE `document_creation_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `document_monitoring_definition`
--
ALTER TABLE `document_monitoring_definition`
  MODIFY `document_monitoring_definition_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `document_practice_definition`
--
ALTER TABLE `document_practice_definition`
  MODIFY `document_practice_definition_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `evaluations`
--
ALTER TABLE `evaluations`
  MODIFY `evaluation_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `faculty`
--
ALTER TABLE `faculty`
  MODIFY `faculty_id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `item`
--
ALTER TABLE `item`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `item_academic_practice_emotional_salary`
--
ALTER TABLE `item_academic_practice_emotional_salary`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `item_job_offer_emotional_salary`
--
ALTER TABLE `item_job_offer_emotional_salary`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `job_offer`
--
ALTER TABLE `job_offer`
  MODIFY `job_offer_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `licensing_configuration`
--
ALTER TABLE `licensing_configuration`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `menu_page`
--
ALTER TABLE `menu_page`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_activities_definitions`
--
ALTER TABLE `monitoring_activities_definitions`
  MODIFY `activity_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_activity_assistance`
--
ALTER TABLE `monitoring_activity_assistance`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_activity_log`
--
ALTER TABLE `monitoring_activity_log`
  MODIFY `activity_log_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_evaluation`
--
ALTER TABLE `monitoring_evaluation`
  MODIFY `evaluation_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_legalized`
--
ALTER TABLE `monitoring_legalized`
  MODIFY `monitoring_legalized_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_plan`
--
ALTER TABLE `monitoring_plan`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `monitoring_plan_schedule`
--
ALTER TABLE `monitoring_plan_schedule`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notification`
--
ALTER TABLE `notification`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notification_log`
--
ALTER TABLE `notification_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notification_user`
--
ALTER TABLE `notification_user`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notification_user_bkp`
--
ALTER TABLE `notification_user_bkp`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `opportunity`
--
ALTER TABLE `opportunity`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `opportunity_application`
--
ALTER TABLE `opportunity_application`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `opportunity_language`
--
ALTER TABLE `opportunity_language`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pages`
--
ALTER TABLE `pages`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `parameter_configuration`
--
ALTER TABLE `parameter_configuration`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `parametric_message`
--
ALTER TABLE `parametric_message`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `password_reset_key`
--
ALTER TABLE `password_reset_key`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `postulant_profile`
--
ALTER TABLE `postulant_profile`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `practice_boss`
--
ALTER TABLE `practice_boss`
  MODIFY `boss_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `practice_evaluation`
--
ALTER TABLE `practice_evaluation`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `practice_plan`
--
ALTER TABLE `practice_plan`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_awards`
--
ALTER TABLE `profile_awards`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_enrolled_program`
--
ALTER TABLE `profile_enrolled_program`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_graduate_program`
--
ALTER TABLE `profile_graduate_program`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_interest_areas`
--
ALTER TABLE `profile_interest_areas`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_language`
--
ALTER TABLE `profile_language`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_other_studies`
--
ALTER TABLE `profile_other_studies`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_profile_version`
--
ALTER TABLE `profile_profile_version`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_program_extra_info`
--
ALTER TABLE `profile_program_extra_info`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_references`
--
ALTER TABLE `profile_references`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_skill`
--
ALTER TABLE `profile_skill`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `profile_work_experiences`
--
ALTER TABLE `profile_work_experiences`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `program`
--
ALTER TABLE `program`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `programs_type_practices`
--
ALTER TABLE `programs_type_practices`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `program_all`
--
ALTER TABLE `program_all`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `program_faculty`
--
ALTER TABLE `program_faculty`
  MODIFY `program_faculty_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `role`
--
ALTER TABLE `role`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `rss_authorization`
--
ALTER TABLE `rss_authorization`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `schema_version`
--
ALTER TABLE `schema_version`
  MODIFY `version_rank` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `skill`
--
ALTER TABLE `skill`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `state`
--
ALTER TABLE `state`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `states_authorized_practice`
--
ALTER TABLE `states_authorized_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `state_trancision_authorized_practice`
--
ALTER TABLE `state_trancision_authorized_practice`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `study_working`
--
ALTER TABLE `study_working`
  MODIFY `study_working_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `summary_bulk_mail`
--
ALTER TABLE `summary_bulk_mail`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `temp_postulant_to_notify`
--
ALTER TABLE `temp_postulant_to_notify`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tracing_monitoring`
--
ALTER TABLE `tracing_monitoring`
  MODIFY `tracing_monitoring_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tracing_practices`
--
ALTER TABLE `tracing_practices`
  MODIFY `tracing_practice_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tracking_schedule`
--
ALTER TABLE `tracking_schedule`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `user`
--
ALTER TABLE `user`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `user_monitoring_tracing`
--
ALTER TABLE `user_monitoring_tracing`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `user_tracing`
--
ALTER TABLE `user_tracing`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `academic_practice`
--
ALTER TABLE `academic_practice`
  ADD CONSTRAINT `fk_academic_practice_contract_type` FOREIGN KEY (`contract_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_practice_country` FOREIGN KEY (`country`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `fk_academic_practice_dedication` FOREIGN KEY (`dedication`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_practice_opportunity` FOREIGN KEY (`academic_practice_id`) REFERENCES `opportunity` (`id`),
  ADD CONSTRAINT `fk_academic_practice_period` FOREIGN KEY (`period`) REFERENCES `academic_period` (`id`),
  ADD CONSTRAINT `fk_attachment_req_doc` FOREIGN KEY (`required_document`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_attachment_req_doc_2` FOREIGN KEY (`required_document_2`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_attachment_req_doc_3` FOREIGN KEY (`required_document_3`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_item_job_area` FOREIGN KEY (`job_area`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `academic_practice_legalized`
--
ALTER TABLE `academic_practice_legalized`
  ADD CONSTRAINT `fk_academic_period_apl` FOREIGN KEY (`academic_period_apl`) REFERENCES `academic_period` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_academic_practice_legalized_item` FOREIGN KEY (`practice_type_authorization`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_academic_practice_legalized_user_tutor` FOREIGN KEY (`user_tutor`) REFERENCES `user` (`id`),
  ADD CONSTRAINT `fk_apl_user` FOREIGN KEY (`user_tutor_2`) REFERENCES `user` (`id`),
  ADD CONSTRAINT `fk_boss_information_prc_leg` FOREIGN KEY (`boss_apl`) REFERENCES `practice_boss` (`boss_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_city_prc_leg` FOREIGN KEY (`city_apl`) REFERENCES `city` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_company_legalized_prc_leg` FOREIGN KEY (`company_apl`) REFERENCES `company` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_contract_type_prc_leg` FOREIGN KEY (`contract_type_apl`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_country_prc_leg` FOREIGN KEY (`country_apl`) REFERENCES `country` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_dedication_hour_week_prc_leg` FOREIGN KEY (`dedication_hour_week_apl`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `Fk_faculty_apl_faculty` FOREIGN KEY (`faculty_apl`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `fk_function_prc_leg` FOREIGN KEY (`function`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_item_t_arl_apl` FOREIGN KEY (`arl`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_obtain_practice_prc_leg` FOREIGN KEY (`obtain_practice`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_offer_commes` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_postulant_practitioner_prc_leg` FOREIGN KEY (`postulant_apl`) REFERENCES `postulant` (`postulant_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_practice_type_prc_leg` FOREIGN KEY (`practice_type`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_program_legalized_prc_leg` FOREIGN KEY (`program_apl`) REFERENCES `program` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `academic_practice_opportunity_language`
--
ALTER TABLE `academic_practice_opportunity_language`
  ADD CONSTRAINT `fk_academic_practice_opportunity_language_academic_practice` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_academic_practice_opportunity_language_opportunity_language` FOREIGN KEY (`opportunity_language_id`) REFERENCES `opportunity_language` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `academic_practice_student`
--
ALTER TABLE `academic_practice_student`
  ADD CONSTRAINT `fk_academic_period` FOREIGN KEY (`period_id`) REFERENCES `academic_period` (`id`),
  ADD CONSTRAINT `FK_academic_practice_student_item` FOREIGN KEY (`practice_id`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_parametric_message` FOREIGN KEY (`parametric_message_id`) REFERENCES `parametric_message` (`id`),
  ADD CONSTRAINT `fk_practice_student_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`),
  ADD CONSTRAINT `fk_practice_student_program_faculty` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`),
  ADD CONSTRAINT `fk_practice_student_student` FOREIGN KEY (`student_id`) REFERENCES `postulant` (`postulant_id`),
  ADD CONSTRAINT `fk_status_authorized` FOREIGN KEY (`status_id`) REFERENCES `states_authorized_practice` (`id`);

--
-- Filtros para la tabla `academic_rules`
--
ALTER TABLE `academic_rules`
  ADD CONSTRAINT `fk_academic_rules_item_academic_var` FOREIGN KEY (`academic_var`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_rules_item_conector` FOREIGN KEY (`conector`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_rules_item_operator` FOREIGN KEY (`operator`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_rules_item_type_practice` FOREIGN KEY (`type_practice`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_academic_rules_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`);

--
-- Filtros para la tabla `access_opportunity_administrator`
--
ALTER TABLE `access_opportunity_administrator`
  ADD CONSTRAINT `fk_access_opportunity_administrator_access_opportunity_type` FOREIGN KEY (`access_opportunity_administrator_id`) REFERENCES `access_opportunity_type` (`id`);

--
-- Filtros para la tabla `access_opportunity_postulant`
--
ALTER TABLE `access_opportunity_postulant`
  ADD CONSTRAINT `fk_access_opportunity_postulant_access_opportunity_type` FOREIGN KEY (`access_opportunity_postulant_id`) REFERENCES `access_opportunity_type` (`id`);

--
-- Filtros para la tabla `access_postulant_practice`
--
ALTER TABLE `access_postulant_practice`
  ADD CONSTRAINT `FK_access_postulant_practice_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `FK_access_postulant_practice_period` FOREIGN KEY (`period_id`) REFERENCES `academic_period` (`id`);

--
-- Filtros para la tabla `access_postulant_practice_program`
--
ALTER TABLE `access_postulant_practice_program`
  ADD CONSTRAINT `FK_access_post_practice_program_access` FOREIGN KEY (`access_postulant_practice_id`) REFERENCES `access_postulant_practice` (`id`),
  ADD CONSTRAINT `FK_access_post_practice_program_program` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`);

--
-- Filtros para la tabla `activities_logs`
--
ALTER TABLE `activities_logs`
  ADD CONSTRAINT `FK_activity_log_medium` FOREIGN KEY (`reporting_medium`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_activity_log_plan` FOREIGN KEY (`practice_plan_id`) REFERENCES `practice_plan` (`id`),
  ADD CONSTRAINT `FK_activity_log_schedule` FOREIGN KEY (`tracking_schedule_id`) REFERENCES `tracking_schedule` (`id`),
  ADD CONSTRAINT `fk_attachment_log_1` FOREIGN KEY (`first_attachment`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_attachment_log_2` FOREIGN KEY (`second_attachment`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_monitoring_logs` FOREIGN KEY (`monitoring_activity_id`) REFERENCES `monitoring_activities_definitions` (`activity_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tracing_logs` FOREIGN KEY (`tracing_practice_id`) REFERENCES `tracing_practices` (`tracing_practice_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `allowed_extensions`
--
ALTER TABLE `allowed_extensions`
  ADD CONSTRAINT `fk_extensions_dpd` FOREIGN KEY (`document_practice_definition_id`) REFERENCES `document_practice_definition` (`document_practice_definition_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_extensions_item` FOREIGN KEY (`item_id`) REFERENCES `item` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `application_info_transnational`
--
ALTER TABLE `application_info_transnational`
  ADD CONSTRAINT `FK__info_trans_city` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK__info_trans_country` FOREIGN KEY (`country_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK__info_trans_item` FOREIGN KEY (`currency`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK__info_trans_opportunity_application` FOREIGN KEY (`application_id`) REFERENCES `opportunity_application` (`id`);

--
-- Filtros para la tabla `approval_documents`
--
ALTER TABLE `approval_documents`
  ADD CONSTRAINT `fk_administer_prc_leg2` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_approval_document` FOREIGN KEY (`document_practice_definition_id`,`academic_practice_legalized_id`) REFERENCES `document_practice` (`document_practice_definition_id`, `academic_practice_legalized_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `approval_monitoring_documents`
--
ALTER TABLE `approval_monitoring_documents`
  ADD CONSTRAINT `fk_administer_mon_leg2` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_approval_mon_document` FOREIGN KEY (`document_monitoring_definition_id`,`monitoring_legalized_id`) REFERENCES `document_monitoring` (`document_monitoring_definition_id`, `monitoring_legalized_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `approval_program_academic_practice`
--
ALTER TABLE `approval_program_academic_practice`
  ADD CONSTRAINT `fk_approval_program_academic_practice_opportunity` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_approval_program_academic_practice_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `authorized_study_working`
--
ALTER TABLE `authorized_study_working`
  ADD CONSTRAINT `fk_authorized_study_working_postulant` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`);

--
-- Filtros para la tabla `authorized_study_working_log`
--
ALTER TABLE `authorized_study_working_log`
  ADD CONSTRAINT `authorized_study_working_log_ibfk_1` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`);

--
-- Filtros para la tabla `branch`
--
ALTER TABLE `branch`
  ADD CONSTRAINT `fk_active_directory_item` FOREIGN KEY (`active_directory`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_city` FOREIGN KEY (`city`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `fk_country` FOREIGN KEY (`country`) REFERENCES `country` (`id`);

--
-- Filtros para la tabla `change_status_approval_program_academic_practice`
--
ALTER TABLE `change_status_approval_program_academic_practice`
  ADD CONSTRAINT `change_status_approval_program_academic_practice_ibfk_1` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `change_status_approval_program_academic_practice_ibfk_2` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `change_status_authorized_practice`
--
ALTER TABLE `change_status_authorized_practice`
  ADD CONSTRAINT `fk_change_status_authorized_practice_after` FOREIGN KEY (`status_after`) REFERENCES `states_authorized_practice` (`id`),
  ADD CONSTRAINT `fk_change_status_authorized_practice_authorized_practice` FOREIGN KEY (`authorized_practice_id`) REFERENCES `academic_practice_student` (`id`),
  ADD CONSTRAINT `fk_change_status_authorized_practice_before` FOREIGN KEY (`status_before`) REFERENCES `states_authorized_practice` (`id`);

--
-- Filtros para la tabla `change_status_company`
--
ALTER TABLE `change_status_company`
  ADD CONSTRAINT `fk_change_status_company_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`);

--
-- Filtros para la tabla `change_status_legalized`
--
ALTER TABLE `change_status_legalized`
  ADD CONSTRAINT `fk_change_status_apl` FOREIGN KEY (`academic_practice_legalized_id`) REFERENCES `academic_practice_legalized` (`academic_practice_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_change_status` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `change_status_monitoring_legalized`
--
ALTER TABLE `change_status_monitoring_legalized`
  ADD CONSTRAINT `fk_change_status_ml` FOREIGN KEY (`monitoring_legalized_id`) REFERENCES `monitoring_legalized` (`monitoring_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_ml_change_status` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `change_status_monitoring_plan`
--
ALTER TABLE `change_status_monitoring_plan`
  ADD CONSTRAINT `fk_change_status_mp` FOREIGN KEY (`monitoring_plan_id`) REFERENCES `practice_plan` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_change_status_mp` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `change_status_opportunity`
--
ALTER TABLE `change_status_opportunity`
  ADD CONSTRAINT `fk_change_status_opportunity_opportunity` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity` (`id`);

--
-- Filtros para la tabla `change_status_practice_plan`
--
ALTER TABLE `change_status_practice_plan`
  ADD CONSTRAINT `fk_change_status_pp` FOREIGN KEY (`practice_plan_id`) REFERENCES `practice_plan` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_change_status_pp` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `change_status_user`
--
ALTER TABLE `change_status_user`
  ADD CONSTRAINT `fk_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `city`
--
ALTER TABLE `city`
  ADD CONSTRAINT `FK1_state_id` FOREIGN KEY (`state_id`) REFERENCES `state` (`id`);

--
-- Filtros para la tabla `company`
--
ALTER TABLE `company`
  ADD CONSTRAINT `FK5_city` FOREIGN KEY (`city`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK5_country` FOREIGN KEY (`country`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `fk_attachment_rut` FOREIGN KEY (`rut`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `FK_company_agency_attachment` FOREIGN KEY (`agency_head_hunter_cert`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_company_business_sector` FOREIGN KEY (`business_sector`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_company_chamber_attachment` FOREIGN KEY (`chamber_commerce_cert`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_company_identification_type` FOREIGN KEY (`identification_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_company_logo` FOREIGN KEY (`logo_id`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_item_arl` FOREIGN KEY (`arl`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_lr_identification` FOREIGN KEY (`lr_identification_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_resource_type` FOREIGN KEY (`resources_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_sector` FOREIGN KEY (`sector`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_size` FOREIGN KEY (`size`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_snies_sector` FOREIGN KEY (`snies_sector`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `company_document`
--
ALTER TABLE `company_document`
  ADD CONSTRAINT `FK_company_document_attachment` FOREIGN KEY (`attachment_id`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `FK_company_document_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  ADD CONSTRAINT `FK_company_document_item_agg_type` FOREIGN KEY (`aggrement_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_company_document_item_doc_type` FOREIGN KEY (`document_type`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `company_office`
--
ALTER TABLE `company_office`
  ADD CONSTRAINT `fk_company_office_city` FOREIGN KEY (`city`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `fk_company_office_company` FOREIGN KEY (`company`) REFERENCES `company` (`id`),
  ADD CONSTRAINT `fk_company_office_country` FOREIGN KEY (`country`) REFERENCES `country` (`id`);

--
-- Filtros para la tabla `company_user`
--
ALTER TABLE `company_user`
  ADD CONSTRAINT `fk_city_company_user` FOREIGN KEY (`city`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `fk_company_user_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  ADD CONSTRAINT `fk_company_user_user` FOREIGN KEY (`company_user_id`) REFERENCES `user` (`id`),
  ADD CONSTRAINT `fk_country_company_user` FOREIGN KEY (`country`) REFERENCES `country` (`id`);

--
-- Filtros para la tabla `course`
--
ALTER TABLE `course`
  ADD CONSTRAINT `fk_course_area` FOREIGN KEY (`area`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_course_faculty` FOREIGN KEY (`faculty`) REFERENCES `faculty` (`faculty_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_course_level` FOREIGN KEY (`level`) REFERENCES `item` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `document_creation_log`
--
ALTER TABLE `document_creation_log`
  ADD CONSTRAINT `FK_document_log_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `document_monitoring`
--
ALTER TABLE `document_monitoring`
  ADD CONSTRAINT `fk_document_mon_attached` FOREIGN KEY (`document_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_document_monitoring` FOREIGN KEY (`monitoring_legalized_id`) REFERENCES `monitoring_legalized` (`monitoring_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_document_monitoring_dpd` FOREIGN KEY (`document_monitoring_definition_id`) REFERENCES `document_monitoring_definition` (`document_monitoring_definition_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `document_monitoring_definition`
--
ALTER TABLE `document_monitoring_definition`
  ADD CONSTRAINT `fk_mon_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_mon_model_attached` FOREIGN KEY (`model_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_mon_template_attached` FOREIGN KEY (`template_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `document_practice`
--
ALTER TABLE `document_practice`
  ADD CONSTRAINT `fk_document_attached` FOREIGN KEY (`document_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_document_practice_apl` FOREIGN KEY (`academic_practice_legalized_id`) REFERENCES `academic_practice_legalized` (`academic_practice_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_document_practice_dpd` FOREIGN KEY (`document_practice_definition_id`) REFERENCES `document_practice_definition` (`document_practice_definition_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `document_practice_definition`
--
ALTER TABLE `document_practice_definition`
  ADD CONSTRAINT `fk_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_model_attached` FOREIGN KEY (`model_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_practice_type_prc_def` FOREIGN KEY (`practice_type`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_template_attached` FOREIGN KEY (`template_attached_id`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `document_practice_def_program`
--
ALTER TABLE `document_practice_def_program`
  ADD CONSTRAINT `FK_doc_practice_def_prog_doc_practice_def` FOREIGN KEY (`document_practice_definition_id`) REFERENCES `document_practice_definition` (`document_practice_definition_id`),
  ADD CONSTRAINT `FK_doc_practice_def_prog_program` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`);

--
-- Filtros para la tabla `evaluations`
--
ALTER TABLE `evaluations`
  ADD CONSTRAINT `FK_evaluation_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `FK_evaluation_practice` FOREIGN KEY (`practice_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_evaluations_academic_period` FOREIGN KEY (`period`) REFERENCES `academic_period` (`id`),
  ADD CONSTRAINT `FK_evaluations_item` FOREIGN KEY (`type_survey`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `evaluation_program`
--
ALTER TABLE `evaluation_program`
  ADD CONSTRAINT `FK_evaluation_program_evaluation` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations` (`evaluation_id`),
  ADD CONSTRAINT `FK_evaluation_program_program` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`);

--
-- Filtros para la tabla `faculty`
--
ALTER TABLE `faculty`
  ADD CONSTRAINT `fk_city_ident_from_signer` FOREIGN KEY (`identification_from_signer`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK_faculty_branch` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`),
  ADD CONSTRAINT `fk_item_ident_type_signer` FOREIGN KEY (`identification_type_signer`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `item`
--
ALTER TABLE `item`
  ADD CONSTRAINT `fk_list` FOREIGN KEY (`list_id`) REFERENCES `dynamic_list` (`id`),
  ADD CONSTRAINT `fk_parentitem` FOREIGN KEY (`parent_id`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `item_academic_practice_cities`
--
ALTER TABLE `item_academic_practice_cities`
  ADD CONSTRAINT `fk_academic_practice_cities_academic_practice` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_academic_practice_cities_item` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `item_academic_practice_emotional_salary`
--
ALTER TABLE `item_academic_practice_emotional_salary`
  ADD CONSTRAINT `FK_emotional_pr_academic_practice` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`),
  ADD CONSTRAINT `FK_emotional_pr_item` FOREIGN KEY (`item_id`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `item_job_offer_cities`
--
ALTER TABLE `item_job_offer_cities`
  ADD CONSTRAINT `FK2_city_id` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `fk_job_offer_cities_job_offer` FOREIGN KEY (`job_offer_id`) REFERENCES `job_offer` (`job_offer_id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `item_job_offer_emotional_salary`
--
ALTER TABLE `item_job_offer_emotional_salary`
  ADD CONSTRAINT `FK__salary_emotional_item` FOREIGN KEY (`item_id`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK__salary_emotional_job_offer` FOREIGN KEY (`job_offer_id`) REFERENCES `job_offer` (`job_offer_id`);

--
-- Filtros para la tabla `job_offer`
--
ALTER TABLE `job_offer`
  ADD CONSTRAINT `fk_job_offer_contract_type` FOREIGN KEY (`contract_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_job_offer_country` FOREIGN KEY (`country`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `fk_job_offer_dedication` FOREIGN KEY (`dedication`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_job_offer_opportunity` FOREIGN KEY (`job_offer_id`) REFERENCES `opportunity` (`id`),
  ADD CONSTRAINT `fk_job_offer_position_level` FOREIGN KEY (`position_level`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_job_offer_years_experience` FOREIGN KEY (`years_experience`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `job_offer_opportunity_language`
--
ALTER TABLE `job_offer_opportunity_language`
  ADD CONSTRAINT `fk_job_offer_opportunity_language_job_offer` FOREIGN KEY (`job_offer_id`) REFERENCES `job_offer` (`job_offer_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_job_offer_opportunity_language_opportunity_language` FOREIGN KEY (`opportunity_language_id`) REFERENCES `opportunity_language` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `job_offer_skills`
--
ALTER TABLE `job_offer_skills`
  ADD CONSTRAINT `fk_job_offer_skills_job_offer` FOREIGN KEY (`job_offer_id`) REFERENCES `job_offer` (`job_offer_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_job_offer_skills_skills` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `monitoring_activities_definitions`
--
ALTER TABLE `monitoring_activities_definitions`
  ADD CONSTRAINT `FK_monitoring_activities_definitions_attachment` FOREIGN KEY (`template_attached`) REFERENCES `attachment` (`id`);

--
-- Filtros para la tabla `monitoring_activity_assistance`
--
ALTER TABLE `monitoring_activity_assistance`
  ADD CONSTRAINT `fk_assistance_activity_log` FOREIGN KEY (`activity_log_id`) REFERENCES `monitoring_activity_log` (`activity_log_id`),
  ADD CONSTRAINT `fk_program_activity_log` FOREIGN KEY (`student_program_id`) REFERENCES `program` (`id`);

--
-- Filtros para la tabla `monitoring_activity_log`
--
ALTER TABLE `monitoring_activity_log`
  ADD CONSTRAINT `FK_activity_mon_log_plan` FOREIGN KEY (`monitoring_plan_id`) REFERENCES `monitoring_plan` (`id`),
  ADD CONSTRAINT `fk_ml_item_activity_type` FOREIGN KEY (`activity_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_mon_attachment_log_1` FOREIGN KEY (`first_attachment`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_mon_attachment_log_2` FOREIGN KEY (`second_attachment`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tracing_mon_logs` FOREIGN KEY (`tracing_monitoring_id`) REFERENCES `tracing_monitoring` (`tracing_monitoring_id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `monitoring_allowed_extensions`
--
ALTER TABLE `monitoring_allowed_extensions`
  ADD CONSTRAINT `fk_extensions_dmd` FOREIGN KEY (`document_monitoring_definition_id`) REFERENCES `document_monitoring_definition` (`document_monitoring_definition_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_extensions_mae_item` FOREIGN KEY (`item_id`) REFERENCES `item` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `monitoring_evaluation`
--
ALTER TABLE `monitoring_evaluation`
  ADD CONSTRAINT `FK_mon_evaluation_academic_period` FOREIGN KEY (`period`) REFERENCES `academic_period` (`id`),
  ADD CONSTRAINT `FK_mon_evaluation_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `FK_mon_evaluation_item` FOREIGN KEY (`type_survey`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `monitoring_evaluation_category`
--
ALTER TABLE `monitoring_evaluation_category`
  ADD CONSTRAINT `FK_mon_evaluation_category_category` FOREIGN KEY (`category`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_mon_evaluation_category_evaluation` FOREIGN KEY (`evaluation_id`) REFERENCES `monitoring_evaluation` (`evaluation_id`);

--
-- Filtros para la tabla `monitoring_evaluation_program`
--
ALTER TABLE `monitoring_evaluation_program`
  ADD CONSTRAINT `FK_mon_evaluation_program_evaluation` FOREIGN KEY (`evaluation_id`) REFERENCES `monitoring_evaluation` (`evaluation_id`),
  ADD CONSTRAINT `FK_mon_evaluation_program_program` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`);

--
-- Filtros para la tabla `monitoring_legalized`
--
ALTER TABLE `monitoring_legalized`
  ADD CONSTRAINT `fk_academic_period_ml` FOREIGN KEY (`period_ml`) REFERENCES `academic_period` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_coordinator_idx` FOREIGN KEY (`user_coordinator`) REFERENCES `user` (`id`),
  ADD CONSTRAINT `fk_dedication_hour_leg` FOREIGN KEY (`dedication_hours`) REFERENCES `item` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ml_item_account_type` FOREIGN KEY (`account_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_ml_item_eps` FOREIGN KEY (`eps`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_ml_item_fin_bank` FOREIGN KEY (`fin_bank`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_ml_item_residence_area` FOREIGN KEY (`residence_area`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_monitoring_commes` FOREIGN KEY (`study_working_id`) REFERENCES `study_working` (`study_working_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_monitoring_faculty` FOREIGN KEY (`faculty_ml`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `FK_monitoring_legalized_item_1` FOREIGN KEY (`category`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_monitoring_legalized_item_2` FOREIGN KEY (`remuneration_hour_per_week`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_postulant_monitor_leg` FOREIGN KEY (`postulant_ml`) REFERENCES `postulant` (`postulant_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_program_legalized_mon_leg` FOREIGN KEY (`program_ml`) REFERENCES `program` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_teacher_idx` FOREIGN KEY (`user_teacher`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `monitoring_plan`
--
ALTER TABLE `monitoring_plan`
  ADD CONSTRAINT `FK_plan_mon_postulant` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`),
  ADD CONSTRAINT `FK_plan_monitoring_legalized` FOREIGN KEY (`monitoring_legalized_id`) REFERENCES `monitoring_legalized` (`monitoring_legalized_id`),
  ADD CONSTRAINT `FK_plan_study_working` FOREIGN KEY (`study_working_id`) REFERENCES `study_working` (`study_working_id`);

--
-- Filtros para la tabla `monitoring_plan_schedule`
--
ALTER TABLE `monitoring_plan_schedule`
  ADD CONSTRAINT `FK_schedule_monitoring_plan` FOREIGN KEY (`monitoring_plan_id`) REFERENCES `monitoring_plan` (`id`);

--
-- Filtros para la tabla `notification_user`
--
ALTER TABLE `notification_user`
  ADD CONSTRAINT `fk_notification_user_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `notification_user_bkp`
--
ALTER TABLE `notification_user_bkp`
  ADD CONSTRAINT `fk_notification_user_bkp_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `opportunity`
--
ALTER TABLE `opportunity`
  ADD CONSTRAINT `fk_opportunity_branch` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`),
  ADD CONSTRAINT `fk_opportunity_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`);

--
-- Filtros para la tabla `opportunity_application`
--
ALTER TABLE `opportunity_application`
  ADD CONSTRAINT `application_cv_fk` FOREIGN KEY (`postulant_cv`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `application_opportunity_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity` (`id`),
  ADD CONSTRAINT `application_postulant_fk` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`),
  ADD CONSTRAINT `fk_item_c_arl` FOREIGN KEY (`company_arl`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_t_identification_type` FOREIGN KEY (`tutor_identification_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_opportunity_application_document` FOREIGN KEY (`opp_required_document`) REFERENCES `attachment` (`id`);

--
-- Filtros para la tabla `opportunity_language`
--
ALTER TABLE `opportunity_language`
  ADD CONSTRAINT `fk_opportunity_language_language` FOREIGN KEY (`language_id`) REFERENCES `item` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_opportunity_language_level` FOREIGN KEY (`level_id`) REFERENCES `item` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `opportunity_programs`
--
ALTER TABLE `opportunity_programs`
  ADD CONSTRAINT `fk_opportunity_programs_opportunity` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_opportunity_programs_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `postulant`
--
ALTER TABLE `postulant`
  ADD CONSTRAINT `FK_postulant_city` FOREIGN KEY (`city_birth_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK_postulant_city_2` FOREIGN KEY (`city_residence_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK_postulant_country` FOREIGN KEY (`country_birth_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK_postulant_country_2` FOREIGN KEY (`country_residence_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK_postulant_state` FOREIGN KEY (`state_birth_id`) REFERENCES `state` (`id`),
  ADD CONSTRAINT `FK_postulant_state_2` FOREIGN KEY (`state_residence_id`) REFERENCES `state` (`id`),
  ADD CONSTRAINT `fk_postulant_user` FOREIGN KEY (`postulant_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `postulant_profile`
--
ALTER TABLE `postulant_profile`
  ADD CONSTRAINT `FK_postulant_profile_item` FOREIGN KEY (`level_job`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_postulant_profile_item_4` FOREIGN KEY (`company_sector`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `postulant_fk` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`);

--
-- Filtros para la tabla `practice_boss`
--
ALTER TABLE `practice_boss`
  ADD CONSTRAINT `FK_boss_identification_type` FOREIGN KEY (`identification_type`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `practice_evaluation`
--
ALTER TABLE `practice_evaluation`
  ADD CONSTRAINT `fk_evaluation_apl` FOREIGN KEY (`academic_practice_legalized_id`) REFERENCES `academic_practice_legalized` (`academic_practice_legalized_id`),
  ADD CONSTRAINT `fk_evaluation_eval` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations` (`evaluation_id`);

--
-- Filtros para la tabla `practice_plan`
--
ALTER TABLE `practice_plan`
  ADD CONSTRAINT `FK_plan_academic_practice` FOREIGN KEY (`academic_practice_id`) REFERENCES `academic_practice` (`academic_practice_id`),
  ADD CONSTRAINT `FK_plan_attachment` FOREIGN KEY (`signed_document`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `FK_plan_postulant` FOREIGN KEY (`postulant_id`) REFERENCES `postulant` (`postulant_id`),
  ADD CONSTRAINT `FK_plan_practice_legalized` FOREIGN KEY (`academic_practice_legalized_id`) REFERENCES `academic_practice_legalized` (`academic_practice_legalized_id`);

--
-- Filtros para la tabla `profile_awards`
--
ALTER TABLE `profile_awards`
  ADD CONSTRAINT `FK_item_profile_awards` FOREIGN KEY (`award_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_profile_profile_awards` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_cv`
--
ALTER TABLE `profile_cv`
  ADD CONSTRAINT `FK_attachment_profile_cv` FOREIGN KEY (`attachment_id`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `FK_profile_profile_cv` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_enrolled_program`
--
ALTER TABLE `profile_enrolled_program`
  ADD CONSTRAINT `FK_profile_enrolled_program_city` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK_profile_enrolled_program_country` FOREIGN KEY (`country_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK_profile_enrolled_program_faculty` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`),
  ADD CONSTRAINT `FK_profile_enrolled_program_item` FOREIGN KEY (`university`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_profile_enrolled_program_state` FOREIGN KEY (`state_id`) REFERENCES `state` (`id`),
  ADD CONSTRAINT `profile_fk` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`),
  ADD CONSTRAINT `program_fk` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`);

--
-- Filtros para la tabla `profile_graduate_program`
--
ALTER TABLE `profile_graduate_program`
  ADD CONSTRAINT `FK_profile_graduate_program_city` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK_profile_graduate_program_country` FOREIGN KEY (`country_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK_profile_graduate_program_faculty` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`),
  ADD CONSTRAINT `FK_profile_graduate_program_item` FOREIGN KEY (`university`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_profile_graduate_program_state` FOREIGN KEY (`state_id`) REFERENCES `state` (`id`),
  ADD CONSTRAINT `profile_g_fk` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`),
  ADD CONSTRAINT `program_g_fk` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`);

--
-- Filtros para la tabla `profile_info_permissions`
--
ALTER TABLE `profile_info_permissions`
  ADD CONSTRAINT `FK_profile_permissions` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_interest_areas`
--
ALTER TABLE `profile_interest_areas`
  ADD CONSTRAINT `FK_item_profile_interest_areas` FOREIGN KEY (`area`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_profile_profile_interest_areas` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_language`
--
ALTER TABLE `profile_language`
  ADD CONSTRAINT `fk_item_profile_language_level` FOREIGN KEY (`level`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_profile_language_listen` FOREIGN KEY (`level_listen`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_profile_language_read` FOREIGN KEY (`level_read`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_item_profile_language_write` FOREIGN KEY (`level_write`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `lang_list_fk` FOREIGN KEY (`language`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `profile_l_fk` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_other_studies`
--
ALTER TABLE `profile_other_studies`
  ADD CONSTRAINT `FK_profile_profile_other_studies` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_profile_version`
--
ALTER TABLE `profile_profile_version`
  ADD CONSTRAINT `FK_profile_profile_profile_version` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_program_extra_info`
--
ALTER TABLE `profile_program_extra_info`
  ADD CONSTRAINT `FK_program_profile_extra_info` FOREIGN KEY (`enrolled_program_id`) REFERENCES `profile_enrolled_program` (`id`);

--
-- Filtros para la tabla `profile_references`
--
ALTER TABLE `profile_references`
  ADD CONSTRAINT `FK_profile_references` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_skill`
--
ALTER TABLE `profile_skill`
  ADD CONSTRAINT `FK_profile_profile_skill` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`),
  ADD CONSTRAINT `FK_skill_profile_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill` (`id`);

--
-- Filtros para la tabla `profile_supports`
--
ALTER TABLE `profile_supports`
  ADD CONSTRAINT `FK_attachment_profile_supports` FOREIGN KEY (`attachment_id`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `FK_profile_profile_supports` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`);

--
-- Filtros para la tabla `profile_work_experiences`
--
ALTER TABLE `profile_work_experiences`
  ADD CONSTRAINT `FK__city` FOREIGN KEY (`city_id`) REFERENCES `city` (`id`),
  ADD CONSTRAINT `FK__country` FOREIGN KEY (`country_id`) REFERENCES `country` (`id`),
  ADD CONSTRAINT `FK__postulant_profile` FOREIGN KEY (`profile_id`) REFERENCES `postulant_profile` (`id`),
  ADD CONSTRAINT `FK__state` FOREIGN KEY (`state_id`) REFERENCES `state` (`id`),
  ADD CONSTRAINT `FK_profile_work_experiences_item` FOREIGN KEY (`company_sector`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `program`
--
ALTER TABLE `program`
  ADD CONSTRAINT `FK_program_item` FOREIGN KEY (`type_practice_id`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `programs_type_practices`
--
ALTER TABLE `programs_type_practices`
  ADD CONSTRAINT `FK__program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`),
  ADD CONSTRAINT `FK_item` FOREIGN KEY (`type_practice_id`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_program_faculty` FOREIGN KEY (`program_faculty_id`) REFERENCES `program_faculty` (`program_faculty_id`);

--
-- Filtros para la tabla `program_all`
--
ALTER TABLE `program_all`
  ADD CONSTRAINT `FK_program_all_item` FOREIGN KEY (`type_practice_id`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `program_faculty`
--
ALTER TABLE `program_faculty`
  ADD CONSTRAINT `FK_program_faculty_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`),
  ADD CONSTRAINT `FK_program_faculty_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`);

--
-- Filtros para la tabla `role_access_opportunity_administrator`
--
ALTER TABLE `role_access_opportunity_administrator`
  ADD CONSTRAINT `fk_role_access_opportunity_administrator_administrator` FOREIGN KEY (`access_opportunity_administrator_id`) REFERENCES `access_opportunity_administrator` (`access_opportunity_administrator_id`),
  ADD CONSTRAINT `fk_role_access_opportunity_administrator_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `FK_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`);

--
-- Filtros para la tabla `state`
--
ALTER TABLE `state`
  ADD CONSTRAINT `FK1_country_id` FOREIGN KEY (`country_id`) REFERENCES `country` (`id`);

--
-- Filtros para la tabla `state_trancision_authorized_practice`
--
ALTER TABLE `state_trancision_authorized_practice`
  ADD CONSTRAINT `fk_state_trancision_authorized_practice` FOREIGN KEY (`statesAuthorizedPractice_id`) REFERENCES `states_authorized_practice` (`id`),
  ADD CONSTRAINT `fk_state_trancision_authorized_practice_next` FOREIGN KEY (`statesAuthorizedPractice_next_id`) REFERENCES `states_authorized_practice` (`id`);

--
-- Filtros para la tabla `study_working`
--
ALTER TABLE `study_working`
  ADD CONSTRAINT `fk_study_working_item_contract_type` FOREIGN KEY (`contract_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_study_working_item_dedication_hours` FOREIGN KEY (`dedication_hours`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_study_working_item_remuneration` FOREIGN KEY (`remuneration_hour_per_week`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_study_working_opportunity` FOREIGN KEY (`study_working_id`) REFERENCES `opportunity` (`id`),
  ADD CONSTRAINT `fk_sw_course` FOREIGN KEY (`course`) REFERENCES `course` (`id`),
  ADD CONSTRAINT `fk_sw_item_category` FOREIGN KEY (`category`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `fk_sw_period` FOREIGN KEY (`period_sw`) REFERENCES `academic_period` (`id`);

--
-- Filtros para la tabla `tracing_monitoring`
--
ALTER TABLE `tracing_monitoring`
  ADD CONSTRAINT `fk_mon_tracing` FOREIGN KEY (`monitoring_legalized_id`) REFERENCES `monitoring_legalized` (`monitoring_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tracing_monitoring_attachment` FOREIGN KEY (`document_final_tracing`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `tracing_practices`
--
ALTER TABLE `tracing_practices`
  ADD CONSTRAINT `fk_apl_tracing2` FOREIGN KEY (`academic_practice_legalized_id`) REFERENCES `academic_practice_legalized` (`academic_practice_legalized_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_tracing_boss_certifcation_attch` FOREIGN KEY (`boss_certification_practice`) REFERENCES `attachment` (`id`),
  ADD CONSTRAINT `fk_tracing_practice_attachment` FOREIGN KEY (`document_final_tracing`) REFERENCES `attachment` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `tracking_schedule`
--
ALTER TABLE `tracking_schedule`
  ADD CONSTRAINT `FK_schedule_activity_item` FOREIGN KEY (`activity_type`) REFERENCES `item` (`id`),
  ADD CONSTRAINT `FK_schedule_practice_plan` FOREIGN KEY (`practice_plan_id`) REFERENCES `practice_plan` (`id`),
  ADD CONSTRAINT `FK_schedule_tracking_item` FOREIGN KEY (`tracking_type`) REFERENCES `item` (`id`);

--
-- Filtros para la tabla `user`
--
ALTER TABLE `user`
  ADD CONSTRAINT `fk_user_password_reset_key` FOREIGN KEY (`password_reset_key_id`) REFERENCES `password_reset_key` (`id`);

--
-- Filtros para la tabla `user_branch`
--
ALTER TABLE `user_branch`
  ADD CONSTRAINT `fk_user_branch_branch` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`),
  ADD CONSTRAINT `fk_user_branch_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `user_monitoring_tracing`
--
ALTER TABLE `user_monitoring_tracing`
  ADD CONSTRAINT `fk_user_monitoring_tracing` FOREIGN KEY (`tracing_monitoring_id`) REFERENCES `tracing_monitoring` (`tracing_monitoring_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_monitoring_user` FOREIGN KEY (`id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `user_program`
--
ALTER TABLE `user_program`
  ADD CONSTRAINT `fk_user_program_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`id`),
  ADD CONSTRAINT `fk_user_program_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`);

--
-- Filtros para la tabla `user_role`
--
ALTER TABLE `user_role`
  ADD CONSTRAINT `fk_user_role_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_role_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `user_tracing`
--
ALTER TABLE `user_tracing`
  ADD CONSTRAINT `fk_user_tracing_tracing` FOREIGN KEY (`tracing_practice_id`) REFERENCES `tracing_practices` (`tracing_practice_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_tracing_user` FOREIGN KEY (`id`) REFERENCES `user` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
