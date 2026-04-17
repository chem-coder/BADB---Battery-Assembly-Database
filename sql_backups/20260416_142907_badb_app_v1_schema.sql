--
-- PostgreSQL database dump
--

\restrict qaANycddtf0u3AyP9S3LeGDmZjgxTNFbPYvFBbIcBEpGegD64MInS2fXPyZ4MHJ

-- Dumped from database version 16.11 (Postgres.app)
-- Dumped by pg_dump version 16.11 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: dblink; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA public;


--
-- Name: EXTENSION dblink; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION dblink IS 'connect to other PostgreSQL databases from within a database';


--
-- Name: battery_status; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.battery_status AS ENUM (
    'assembled',
    'testing',
    'completed',
    'failed',
    'disassembled'
);


ALTER TYPE public.battery_status OWNER TO "Dalia";

--
-- Name: electrode_role; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.electrode_role AS ENUM (
    'cathode',
    'anode'
);


ALTER TYPE public.electrode_role OWNER TO "Dalia";

--
-- Name: electrolyte_status; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.electrolyte_status AS ENUM (
    'active',
    'archived',
    'inactive'
);


ALTER TYPE public.electrolyte_status OWNER TO "Dalia";

--
-- Name: electrolyte_type; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.electrolyte_type AS ENUM (
    'liquid',
    'solid',
    'gel'
);


ALTER TYPE public.electrolyte_type OWNER TO "Dalia";

--
-- Name: material_role; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.material_role AS ENUM (
    'active',
    'binder',
    'conductive_additive',
    'solvent',
    'other',
    'cathode_active',
    'anode_active'
);


ALTER TYPE public.material_role OWNER TO "Dalia";

--
-- Name: measure_mode; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.measure_mode AS ENUM (
    'mass',
    'volume'
);


ALTER TYPE public.measure_mode OWNER TO "Dalia";

--
-- Name: project_status; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.project_status AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);


ALTER TYPE public.project_status OWNER TO "Dalia";

--
-- Name: recipe_component_role; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.recipe_component_role AS ENUM (
    'cathode_active',
    'anode_active',
    'binder',
    'additive',
    'solvent'
);


ALTER TYPE public.recipe_component_role OWNER TO "Dalia";

--
-- Name: separator_status; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.separator_status AS ENUM (
    'available',
    'used',
    'scrap'
);


ALTER TYPE public.separator_status OWNER TO "Dalia";

--
-- Name: tape_calc_mode; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.tape_calc_mode AS ENUM (
    'from_active_mass',
    'from_slurry_mass'
);


ALTER TYPE public.tape_calc_mode OWNER TO "Dalia";

--
-- Name: tape_status; Type: TYPE; Schema: public; Owner: Dalia
--

CREATE TYPE public.tape_status AS ENUM (
    'ok',
    'experimental',
    'discarded'
);


ALTER TYPE public.tape_status OWNER TO "Dalia";

--
-- Name: set_row_updated_at(); Type: FUNCTION; Schema: public; Owner: Dalia
--

CREATE FUNCTION public.set_row_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_row_updated_at() OWNER TO "Dalia";

--
-- Name: touch_parent_battery_from_battery_id(); Type: FUNCTION; Schema: public; Owner: Dalia
--

CREATE FUNCTION public.touch_parent_battery_from_battery_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_battery_id integer;
BEGIN
  target_battery_id := COALESCE(NEW.battery_id, OLD.battery_id);

  IF target_battery_id IS NOT NULL THEN
    UPDATE batteries
    SET updated_at = now()
    WHERE battery_id = target_battery_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.touch_parent_battery_from_battery_id() OWNER TO "Dalia";

--
-- Name: touch_parent_tape_from_step_id(); Type: FUNCTION; Schema: public; Owner: Dalia
--

CREATE FUNCTION public.touch_parent_tape_from_step_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_step_id integer;
  target_tape_id integer;
BEGIN
  target_step_id := COALESCE(NEW.step_id, OLD.step_id);

  IF target_step_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT tape_id
  INTO target_tape_id
  FROM tape_process_steps
  WHERE step_id = target_step_id;

  IF target_tape_id IS NOT NULL THEN
    UPDATE tapes
    SET updated_at = now()
    WHERE tape_id = target_tape_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.touch_parent_tape_from_step_id() OWNER TO "Dalia";

--
-- Name: touch_parent_tape_from_tape_id(); Type: FUNCTION; Schema: public; Owner: Dalia
--

CREATE FUNCTION public.touch_parent_tape_from_tape_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_tape_id integer;
BEGIN
  target_tape_id := COALESCE(NEW.tape_id, OLD.tape_id);

  IF target_tape_id IS NOT NULL THEN
    UPDATE tapes
    SET updated_at = now()
    WHERE tape_id = target_tape_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.touch_parent_tape_from_tape_id() OWNER TO "Dalia";

--
-- Name: validate_battery_stack(); Type: FUNCTION; Schema: public; Owner: Dalia
--

CREATE FUNCTION public.validate_battery_stack() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    form TEXT;
    coin_mode TEXT;
    anode_count INT;
    cathode_count INT;
BEGIN
    SELECT form_factor
    INTO form
    FROM batteries
    WHERE battery_id = NEW.battery_id;

-- only get coin_mode if coin
IF form = 'coin' THEN
    SELECT coin_cell_mode
    INTO coin_mode
    FROM battery_coin_config
    WHERE battery_id = NEW.battery_id;
END IF;

    SELECT
        COUNT(*) FILTER (WHERE role = 'anode'),
        COUNT(*) FILTER (WHERE role = 'cathode')
    INTO anode_count, cathode_count
    FROM battery_electrodes
    WHERE battery_id = NEW.battery_id;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'anode' THEN
            anode_count := anode_count + 1;
        ELSIF NEW.role = 'cathode' THEN
            cathode_count := cathode_count + 1;
        END IF;
    END IF;

    -- COIN LOGIC
    IF form = 'coin' THEN

        IF coin_mode = 'half_cell' AND (anode_count + cathode_count ) > 1 THEN
            RAISE EXCEPTION 'Coin half-cell: only one electrode allowed';
        END IF;

        IF coin_mode = 'full_cell' THEN
            IF anode_count > 1 THEN
                RAISE EXCEPTION 'Coin full-cell: only one anode allowed';
            END IF;
            IF cathode_count > 1 THEN
                RAISE EXCEPTION 'Coin full-cell: only one cathode allowed';
            END IF;
        END IF;

    END IF;

    -- POUCH + CYLINDRICAL (UNIFIED LOGIC)
    IF form IN ('pouch', 'cylindrical') THEN

        IF NOT (
            anode_count = cathode_count OR
            anode_count = cathode_count + 1 OR
            cathode_count = anode_count + 1
        ) THEN
            RAISE EXCEPTION 'Stack must be balanced or off by one';
        END IF;

    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.validate_battery_stack() OWNER TO "Dalia";

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_materials; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.active_materials (
    active_material_id integer NOT NULL,
    role public.electrode_role NOT NULL,
    th_capacity_mah numeric,
    th_capacity_ma_g numeric,
    created_at timestamp with time zone DEFAULT now(),
    material_instance_id integer NOT NULL
);


ALTER TABLE public.active_materials OWNER TO "Dalia";

--
-- Name: active_materials_active_material_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.active_materials_active_material_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.active_materials_active_material_id_seq OWNER TO "Dalia";

--
-- Name: active_materials_active_material_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.active_materials_active_material_id_seq OWNED BY public.active_materials.active_material_id;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    user_id integer,
    action character varying(30) NOT NULL,
    entity character varying(50) NOT NULL,
    entity_id integer,
    details jsonb,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.activity_log OWNER TO "Dalia";

--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_log_id_seq OWNER TO "Dalia";

--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: auth_log; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.auth_log (
    id integer NOT NULL,
    user_id integer,
    login character varying(50),
    event character varying(30) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT auth_log_event_check CHECK (((event)::text = ANY ((ARRAY['login_success'::character varying, 'login_failed'::character varying, 'token_refresh'::character varying, 'logout'::character varying, 'register'::character varying, 'password_changed'::character varying])::text[])))
);


ALTER TABLE public.auth_log OWNER TO "Dalia";

--
-- Name: auth_log_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.auth_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.auth_log_id_seq OWNER TO "Dalia";

--
-- Name: auth_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.auth_log_id_seq OWNED BY public.auth_log.id;


--
-- Name: batteries; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.batteries (
    battery_id integer NOT NULL,
    project_id integer NOT NULL,
    form_factor text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    status public.battery_status,
    battery_notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT batteries_form_factor_check CHECK ((form_factor = ANY (ARRAY['coin'::text, 'pouch'::text, 'cylindrical'::text])))
);


ALTER TABLE public.batteries OWNER TO "Dalia";

--
-- Name: batteries_battery_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.batteries_battery_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.batteries_battery_id_seq OWNER TO "Dalia";

--
-- Name: batteries_battery_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.batteries_battery_id_seq OWNED BY public.batteries.battery_id;


--
-- Name: battery_coin_config; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_coin_config (
    battery_id integer NOT NULL,
    half_cell_type text,
    coin_cell_mode text,
    coin_size_code text,
    li_foil_notes text,
    spacer_thickness_mm numeric,
    spacer_count integer,
    coin_layout text,
    spacer_notes text,
    CONSTRAINT battery_coin_config_coin_layout_check CHECK (((coin_layout IS NULL) OR (coin_layout = ANY (ARRAY['SE'::text, 'ES'::text, 'ESE'::text]))))
);


ALTER TABLE public.battery_coin_config OWNER TO "Dalia";

--
-- Name: battery_cyl_config; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_cyl_config (
    battery_id integer NOT NULL,
    cyl_size_code text,
    cyl_notes text
);


ALTER TABLE public.battery_cyl_config OWNER TO "Dalia";

--
-- Name: battery_electrochem; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_electrochem (
    battery_electrochem_id integer NOT NULL,
    battery_id integer NOT NULL,
    file_name text,
    file_link text,
    electrochem_notes text,
    uploaded_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.battery_electrochem OWNER TO "Dalia";

--
-- Name: battery_electrochem_battery_electrochem_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

ALTER TABLE public.battery_electrochem ALTER COLUMN battery_electrochem_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.battery_electrochem_battery_electrochem_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: battery_electrode_sources; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_electrode_sources (
    battery_id integer NOT NULL,
    role public.electrode_role NOT NULL,
    tape_id integer,
    cut_batch_id integer,
    source_notes text
);


ALTER TABLE public.battery_electrode_sources OWNER TO "Dalia";

--
-- Name: battery_electrodes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_electrodes (
    battery_id integer NOT NULL,
    electrode_id integer NOT NULL,
    role public.electrode_role NOT NULL,
    position_index integer
);


ALTER TABLE public.battery_electrodes OWNER TO "Dalia";

--
-- Name: battery_electrolyte; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_electrolyte (
    battery_electrolyte_id integer NOT NULL,
    battery_id integer NOT NULL,
    electrolyte_id integer NOT NULL,
    electrolyte_notes text,
    electrolyte_total_ul numeric
);


ALTER TABLE public.battery_electrolyte OWNER TO "Dalia";

--
-- Name: battery_electrolyte_battery_electrolyte_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.battery_electrolyte_battery_electrolyte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.battery_electrolyte_battery_electrolyte_id_seq OWNER TO "Dalia";

--
-- Name: battery_electrolyte_battery_electrolyte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.battery_electrolyte_battery_electrolyte_id_seq OWNED BY public.battery_electrolyte.battery_electrolyte_id;


--
-- Name: battery_pouch_config; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_pouch_config (
    battery_id integer NOT NULL,
    pouch_notes text,
    pouch_case_size_code text,
    pouch_case_size_other text,
    CONSTRAINT battery_pouch_config_case_size_code_allowed CHECK (((pouch_case_size_code IS NULL) OR (pouch_case_size_code = ANY (ARRAY['103x83'::text, '86x56'::text, 'other'::text])))),
    CONSTRAINT battery_pouch_config_other_size_requires_text CHECK (((pouch_case_size_code IS DISTINCT FROM 'other'::text) OR (NULLIF(btrim(pouch_case_size_other), ''::text) IS NOT NULL)))
);


ALTER TABLE public.battery_pouch_config OWNER TO "Dalia";

--
-- Name: battery_qc; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_qc (
    battery_id integer NOT NULL,
    ocv_v numeric,
    esr_mohm numeric,
    qc_notes text
);


ALTER TABLE public.battery_qc OWNER TO "Dalia";

--
-- Name: battery_sep_config; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.battery_sep_config (
    battery_id integer NOT NULL,
    separator_id integer,
    separator_notes text
);


ALTER TABLE public.battery_sep_config OWNER TO "Dalia";

--
-- Name: coating_methods; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.coating_methods (
    coating_id integer NOT NULL,
    name text NOT NULL,
    gap_um numeric,
    coat_temp_c numeric,
    coat_time_min integer,
    comments text
);


ALTER TABLE public.coating_methods OWNER TO "Dalia";

--
-- Name: coating_methods_coating_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.coating_methods_coating_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.coating_methods_coating_id_seq OWNER TO "Dalia";

--
-- Name: coating_methods_coating_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.coating_methods_coating_id_seq OWNED BY public.coating_methods.coating_id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.departments (
    department_id integer NOT NULL,
    name text NOT NULL,
    head_user_id integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.departments OWNER TO "Dalia";

--
-- Name: departments_department_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.departments_department_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.departments_department_id_seq OWNER TO "Dalia";

--
-- Name: departments_department_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.departments_department_id_seq OWNED BY public.departments.department_id;


--
-- Name: dry_mixing_methods; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.dry_mixing_methods (
    dry_mixing_id integer NOT NULL,
    name text NOT NULL,
    description text
);


ALTER TABLE public.dry_mixing_methods OWNER TO "Dalia";

--
-- Name: dry_mixing_methods_dry_mixing_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.dry_mixing_methods_dry_mixing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dry_mixing_methods_dry_mixing_id_seq OWNER TO "Dalia";

--
-- Name: dry_mixing_methods_dry_mixing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.dry_mixing_methods_dry_mixing_id_seq OWNED BY public.dry_mixing_methods.dry_mixing_id;


--
-- Name: drying_atmospheres; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.drying_atmospheres (
    drying_atmosphere_id integer NOT NULL,
    code text NOT NULL,
    display text NOT NULL,
    ui_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.drying_atmospheres OWNER TO "Dalia";

--
-- Name: drying_atmospheres_drying_atmosphere_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.drying_atmospheres_drying_atmosphere_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.drying_atmospheres_drying_atmosphere_id_seq OWNER TO "Dalia";

--
-- Name: drying_atmospheres_drying_atmosphere_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.drying_atmospheres_drying_atmosphere_id_seq OWNED BY public.drying_atmospheres.drying_atmosphere_id;


--
-- Name: electrode_cut_batches; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrode_cut_batches (
    cut_batch_id integer NOT NULL,
    tape_id integer NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    comments text,
    shape text,
    diameter_mm numeric,
    length_mm numeric,
    width_mm numeric,
    target_form_factor text,
    target_config_code text,
    target_config_other text,
    CONSTRAINT electrode_cut_batches_target_config_code_check CHECK (((target_config_code IS NULL) OR (target_config_code = ANY (ARRAY['2016'::text, '2025'::text, '2032'::text, '103x83'::text, '86x56'::text, '18650'::text, '21700'::text, 'other'::text])))),
    CONSTRAINT electrode_cut_batches_target_config_other_check CHECK (((target_config_code IS DISTINCT FROM 'other'::text) OR (NULLIF(btrim(target_config_other), ''::text) IS NOT NULL))),
    CONSTRAINT electrode_cut_batches_target_form_factor_check CHECK (((target_form_factor IS NULL) OR (target_form_factor = ANY (ARRAY['coin'::text, 'pouch'::text, 'cylindrical'::text])))),
    CONSTRAINT electrode_cut_batches_target_shape_match_check CHECK (((target_form_factor IS NULL) OR ((target_form_factor = 'coin'::text) AND (shape = 'circle'::text)) OR ((target_form_factor = ANY (ARRAY['pouch'::text, 'cylindrical'::text])) AND (shape = 'rectangle'::text)))),
    CONSTRAINT electrode_shape_check CHECK (((shape = ANY (ARRAY['circle'::text, 'rectangle'::text])) OR (shape IS NULL)))
);


ALTER TABLE public.electrode_cut_batches OWNER TO "Dalia";

--
-- Name: electrode_cut_batches_cut_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.electrode_cut_batches_cut_batch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.electrode_cut_batches_cut_batch_id_seq OWNER TO "Dalia";

--
-- Name: electrode_cut_batches_cut_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.electrode_cut_batches_cut_batch_id_seq OWNED BY public.electrode_cut_batches.cut_batch_id;


--
-- Name: electrode_drying; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrode_drying (
    drying_id integer NOT NULL,
    cut_batch_id integer NOT NULL,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone,
    temperature_c numeric,
    other_parameters text,
    comments text
);


ALTER TABLE public.electrode_drying OWNER TO "Dalia";

--
-- Name: electrode_drying_drying_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.electrode_drying_drying_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.electrode_drying_drying_id_seq OWNER TO "Dalia";

--
-- Name: electrode_drying_drying_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.electrode_drying_drying_id_seq OWNED BY public.electrode_drying.drying_id;


--
-- Name: electrode_status; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrode_status (
    status_code integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.electrode_status OWNER TO "Dalia";

--
-- Name: electrodes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrodes (
    electrode_id integer NOT NULL,
    cut_batch_id integer NOT NULL,
    electrode_mass_g numeric NOT NULL,
    cup_number integer,
    scrapped_reason text,
    comments text,
    status_code integer DEFAULT 1 NOT NULL,
    used_in_battery_id integer,
    number_in_batch integer NOT NULL,
    CONSTRAINT electrodes_status_logic_check CHECK ((((status_code = 1) AND (used_in_battery_id IS NULL) AND (scrapped_reason IS NULL)) OR ((status_code = 2) AND (used_in_battery_id IS NOT NULL) AND (scrapped_reason IS NULL)) OR ((status_code = 3) AND (used_in_battery_id IS NULL) AND (scrapped_reason IS NOT NULL))))
);


ALTER TABLE public.electrodes OWNER TO "Dalia";

--
-- Name: electrodes_electrode_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.electrodes_electrode_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.electrodes_electrode_id_seq OWNER TO "Dalia";

--
-- Name: electrodes_electrode_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.electrodes_electrode_id_seq OWNED BY public.electrodes.electrode_id;


--
-- Name: electrolyte_files; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrolyte_files (
    electrolyte_file_id integer NOT NULL,
    electrolyte_id integer NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    file_data bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.electrolyte_files OWNER TO "Dalia";

--
-- Name: electrolyte_files_electrolyte_file_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

ALTER TABLE public.electrolyte_files ALTER COLUMN electrolyte_file_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.electrolyte_files_electrolyte_file_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: electrolytes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.electrolytes (
    electrolyte_id integer NOT NULL,
    name text NOT NULL,
    electrolyte_type public.electrolyte_type NOT NULL,
    solvent_system text,
    salts text,
    concentration text,
    additives text,
    notes text,
    status public.electrolyte_status DEFAULT 'active'::public.electrolyte_status,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.electrolytes OWNER TO "Dalia";

--
-- Name: electrolytes_electrolyte_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.electrolytes_electrolyte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.electrolytes_electrolyte_id_seq OWNER TO "Dalia";

--
-- Name: electrolytes_electrolyte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.electrolytes_electrolyte_id_seq OWNED BY public.electrolytes.electrolyte_id;


--
-- Name: foil_mass_measurements; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.foil_mass_measurements (
    foil_measurement_id integer NOT NULL,
    cut_batch_id integer NOT NULL,
    mass_g numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT foil_mass_measurements_mass_g_check CHECK ((mass_g > (0)::numeric))
);


ALTER TABLE public.foil_mass_measurements OWNER TO "Dalia";

--
-- Name: foil_mass_measurements_foil_measurement_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.foil_mass_measurements_foil_measurement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.foil_mass_measurements_foil_measurement_id_seq OWNER TO "Dalia";

--
-- Name: foil_mass_measurements_foil_measurement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.foil_mass_measurements_foil_measurement_id_seq OWNED BY public.foil_mass_measurements.foil_measurement_id;


--
-- Name: foils; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.foils (
    foil_id integer NOT NULL,
    type text NOT NULL,
    comments text
);


ALTER TABLE public.foils OWNER TO "Dalia";

--
-- Name: foils_foil_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.foils_foil_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.foils_foil_id_seq OWNER TO "Dalia";

--
-- Name: foils_foil_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.foils_foil_id_seq OWNED BY public.foils.foil_id;


--
-- Name: material_instance_components; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.material_instance_components (
    material_instance_component_id integer NOT NULL,
    parent_material_instance_id integer NOT NULL,
    component_material_instance_id integer NOT NULL,
    mass_fraction numeric NOT NULL,
    notes text,
    CONSTRAINT material_instance_components_check CHECK ((parent_material_instance_id <> component_material_instance_id)),
    CONSTRAINT material_instance_components_mass_fraction_check CHECK (((mass_fraction >= (0)::numeric) AND (mass_fraction <= (1)::numeric)))
);


ALTER TABLE public.material_instance_components OWNER TO "Dalia";

--
-- Name: material_instance_components_material_instance_component_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.material_instance_components_material_instance_component_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.material_instance_components_material_instance_component_id_seq OWNER TO "Dalia";

--
-- Name: material_instance_components_material_instance_component_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.material_instance_components_material_instance_component_id_seq OWNED BY public.material_instance_components.material_instance_component_id;


--
-- Name: material_instances; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.material_instances (
    material_instance_id integer NOT NULL,
    material_id integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.material_instances OWNER TO "Dalia";

--
-- Name: material_instances_material_instance_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.material_instances_material_instance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.material_instances_material_instance_id_seq OWNER TO "Dalia";

--
-- Name: material_instances_material_instance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.material_instances_material_instance_id_seq OWNED BY public.material_instances.material_instance_id;


--
-- Name: materials; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.materials (
    material_id integer NOT NULL,
    name text NOT NULL,
    role public.material_role
);


ALTER TABLE public.materials OWNER TO "Dalia";

--
-- Name: materials_material_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.materials_material_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.materials_material_id_seq OWNER TO "Dalia";

--
-- Name: materials_material_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.materials_material_id_seq OWNED BY public.materials.material_id;


--
-- Name: module_batteries; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.module_batteries (
    module_id integer NOT NULL,
    battery_id integer NOT NULL,
    position_index integer NOT NULL
);


ALTER TABLE public.module_batteries OWNER TO "Dalia";

--
-- Name: module_qc; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.module_qc (
    module_id integer NOT NULL,
    module_meas_1 numeric,
    module_meas_2 numeric,
    notes text
);


ALTER TABLE public.module_qc OWNER TO "Dalia";

--
-- Name: modules; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.modules (
    module_id integer NOT NULL,
    other_info_about_modules text
);


ALTER TABLE public.modules OWNER TO "Dalia";

--
-- Name: modules_module_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.modules_module_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.modules_module_id_seq OWNER TO "Dalia";

--
-- Name: modules_module_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.modules_module_id_seq OWNED BY public.modules.module_id;


--
-- Name: operation_types; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.operation_types (
    operation_type_id integer NOT NULL,
    code text NOT NULL,
    display text NOT NULL,
    ui_order integer NOT NULL
);


ALTER TABLE public.operation_types OWNER TO "Dalia";

--
-- Name: operation_types_operation_type_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.operation_types_operation_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.operation_types_operation_type_id_seq OWNER TO "Dalia";

--
-- Name: operation_types_operation_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.operation_types_operation_type_id_seq OWNED BY public.operation_types.operation_type_id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.projects (
    project_id integer NOT NULL,
    name text NOT NULL,
    lead_id integer,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    status public.project_status DEFAULT 'active'::public.project_status NOT NULL,
    description text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confidentiality_level character varying(20) DEFAULT 'public'::character varying,
    department_id integer,
    CONSTRAINT projects_confidentiality_level_check CHECK (((confidentiality_level)::text = ANY ((ARRAY['public'::character varying, 'department'::character varying, 'confidential'::character varying])::text[])))
);


ALTER TABLE public.projects OWNER TO "Dalia";

--
-- Name: projects_project_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.projects_project_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_project_id_seq OWNER TO "Dalia";

--
-- Name: projects_project_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.projects_project_id_seq OWNED BY public.projects.project_id;


--
-- Name: separator_files; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.separator_files (
    separator_file_id integer NOT NULL,
    sep_id integer NOT NULL,
    file_name text,
    mime_type text,
    file_data bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.separator_files OWNER TO "Dalia";

--
-- Name: separator_files_separator_file_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

ALTER TABLE public.separator_files ALTER COLUMN separator_file_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.separator_files_separator_file_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: separator_structure; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.separator_structure (
    sep_str_id integer NOT NULL,
    name text NOT NULL,
    comments text
);


ALTER TABLE public.separator_structure OWNER TO "Dalia";

--
-- Name: separator_structure_sep_str_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.separator_structure_sep_str_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.separator_structure_sep_str_id_seq OWNER TO "Dalia";

--
-- Name: separator_structure_sep_str_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.separator_structure_sep_str_id_seq OWNED BY public.separator_structure.sep_str_id;


--
-- Name: separators; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.separators (
    sep_id integer NOT NULL,
    supplier text,
    name text NOT NULL,
    brand text,
    batch text,
    structure_id integer,
    air_perm numeric,
    air_perm_units text,
    thickness_um numeric,
    porosity numeric,
    comments text,
    status public.separator_status DEFAULT 'available'::public.separator_status NOT NULL,
    depleted_at date,
    created_by integer NOT NULL,
    file bytea,
    file_path text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT separators_available_not_depleted_check CHECK (((status <> 'available'::public.separator_status) OR (depleted_at IS NULL)))
);


ALTER TABLE public.separators OWNER TO "Dalia";

--
-- Name: separators_sep_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.separators_sep_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.separators_sep_id_seq OWNER TO "Dalia";

--
-- Name: separators_sep_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.separators_sep_id_seq OWNED BY public.separators.sep_id;


--
-- Name: tape_process_steps; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_process_steps (
    step_id integer NOT NULL,
    tape_id integer NOT NULL,
    operation_type_id integer NOT NULL,
    performed_by integer NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    comments text,
    ended_at timestamp with time zone,
    CONSTRAINT tape_process_steps_ended_at_not_before_started_at_chk CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at)))
);


ALTER TABLE public.tape_process_steps OWNER TO "Dalia";

--
-- Name: tape_process_steps_step_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.tape_process_steps_step_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tape_process_steps_step_id_seq OWNER TO "Dalia";

--
-- Name: tape_process_steps_step_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.tape_process_steps_step_id_seq OWNED BY public.tape_process_steps.step_id;


--
-- Name: tape_recipe_line_actuals; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_recipe_line_actuals (
    actual_id integer NOT NULL,
    tape_id integer NOT NULL,
    recipe_line_id integer NOT NULL,
    measure_mode public.measure_mode,
    actual_mass_g numeric,
    actual_volume_ml numeric,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    material_instance_id integer NOT NULL,
    CONSTRAINT tape_recipe_line_actuals_check CHECK ((((measure_mode = 'mass'::public.measure_mode) AND (actual_mass_g IS NOT NULL) AND (actual_volume_ml IS NULL)) OR ((measure_mode = 'volume'::public.measure_mode) AND (actual_volume_ml IS NOT NULL) AND (actual_mass_g IS NULL)) OR ((measure_mode IS NULL) AND (actual_mass_g IS NULL) AND (actual_volume_ml IS NULL))))
);


ALTER TABLE public.tape_recipe_line_actuals OWNER TO "Dalia";

--
-- Name: tape_recipe_line_actuals_actual_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.tape_recipe_line_actuals_actual_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tape_recipe_line_actuals_actual_id_seq OWNER TO "Dalia";

--
-- Name: tape_recipe_line_actuals_actual_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.tape_recipe_line_actuals_actual_id_seq OWNED BY public.tape_recipe_line_actuals.actual_id;


--
-- Name: tape_recipe_lines; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_recipe_lines (
    recipe_line_id integer NOT NULL,
    tape_recipe_id integer NOT NULL,
    material_id integer NOT NULL,
    recipe_role public.recipe_component_role NOT NULL,
    line_notes text,
    slurry_percent numeric,
    include_in_pct boolean DEFAULT true NOT NULL,
    CONSTRAINT slurry_percent_range_check CHECK (((slurry_percent >= (0)::numeric) AND (slurry_percent <= (100)::numeric))),
    CONSTRAINT tape_recipe_lines_include_pct_logic_check CHECK ((((include_in_pct = true) AND (slurry_percent IS NOT NULL)) OR ((include_in_pct = false) AND (slurry_percent IS NULL))))
);


ALTER TABLE public.tape_recipe_lines OWNER TO "Dalia";

--
-- Name: tape_recipe_lines_recipe_line_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.tape_recipe_lines_recipe_line_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tape_recipe_lines_recipe_line_id_seq OWNER TO "Dalia";

--
-- Name: tape_recipe_lines_recipe_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.tape_recipe_lines_recipe_line_id_seq OWNED BY public.tape_recipe_lines.recipe_line_id;


--
-- Name: tape_recipes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_recipes (
    tape_recipe_id integer NOT NULL,
    role public.electrode_role NOT NULL,
    name text NOT NULL,
    variant_label text,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tape_recipes OWNER TO "Dalia";

--
-- Name: tape_recipes_tape_recipe_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.tape_recipes_tape_recipe_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tape_recipes_tape_recipe_id_seq OWNER TO "Dalia";

--
-- Name: tape_recipes_tape_recipe_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.tape_recipes_tape_recipe_id_seq OWNED BY public.tape_recipes.tape_recipe_id;


--
-- Name: tape_step_calendering; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_step_calendering (
    step_id integer NOT NULL,
    temp_c numeric,
    pressure_value numeric,
    pressure_units text,
    draw_speed_m_min numeric,
    other_params text,
    init_thickness_microns numeric,
    final_thickness_microns numeric,
    no_passes integer,
    appearance text
);


ALTER TABLE public.tape_step_calendering OWNER TO "Dalia";

--
-- Name: tape_step_coating; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_step_coating (
    step_id integer NOT NULL,
    foil_id integer,
    coating_id integer,
    gap_um numeric,
    coat_temp_c numeric,
    coat_time_min integer,
    method_comments text
);


ALTER TABLE public.tape_step_coating OWNER TO "Dalia";

--
-- Name: tape_step_drying; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_step_drying (
    step_id integer NOT NULL,
    temperature_c numeric,
    atmosphere text,
    target_duration_min integer,
    other_parameters text
);


ALTER TABLE public.tape_step_drying OWNER TO "Dalia";

--
-- Name: tape_step_mixing; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tape_step_mixing (
    step_id integer NOT NULL,
    slurry_volume_ml numeric,
    dry_mixing_id integer,
    dry_start_time timestamp with time zone,
    dry_duration_min integer,
    dry_rpm text,
    wet_mixing_id integer,
    wet_start_time timestamp with time zone,
    wet_duration_min integer,
    wet_rpm text,
    viscosity_cp numeric,
    dry_end_time timestamp with time zone,
    wet_end_time timestamp with time zone,
    CONSTRAINT tape_step_mixing_dry_end_time_not_before_start_chk CHECK (((dry_end_time IS NULL) OR (dry_start_time IS NULL) OR (dry_end_time >= dry_start_time))),
    CONSTRAINT tape_step_mixing_wet_end_time_not_before_start_chk CHECK (((wet_end_time IS NULL) OR (wet_start_time IS NULL) OR (wet_end_time >= wet_start_time)))
);


ALTER TABLE public.tape_step_mixing OWNER TO "Dalia";

--
-- Name: tapes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tapes (
    tape_id integer NOT NULL,
    project_id integer,
    tape_recipe_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.tape_status,
    notes text,
    name text DEFAULT 'Unnamed tape'::text NOT NULL,
    calc_mode public.tape_calc_mode,
    target_mass_g numeric,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tapes OWNER TO "Dalia";

--
-- Name: tapes_tape_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.tapes_tape_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tapes_tape_id_seq OWNER TO "Dalia";

--
-- Name: tapes_tape_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.tapes_tape_id_seq OWNED BY public.tapes.tape_id;


--
-- Name: user_project_access; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.user_project_access (
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    granted_by integer,
    granted_at timestamp with time zone DEFAULT now(),
    access_level character varying(20) DEFAULT 'view'::character varying,
    CONSTRAINT user_project_access_access_level_check CHECK (((access_level)::text = ANY ((ARRAY['view'::character varying, 'edit'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.user_project_access OWNER TO "Dalia";

--
-- Name: users; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    login character varying(50),
    password_hash character varying(255),
    role character varying(20) DEFAULT 'employee'::character varying,
    "position" character varying(200),
    token_version integer DEFAULT 1 NOT NULL,
    department_id integer,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['employee'::character varying, 'lead'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO "Dalia";

--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_user_id_seq OWNER TO "Dalia";

--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: wet_mixing_methods; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.wet_mixing_methods (
    wet_mixing_id integer NOT NULL,
    name text NOT NULL,
    description text
);


ALTER TABLE public.wet_mixing_methods OWNER TO "Dalia";

--
-- Name: wet_mixing_methods_wet_mixing_id_seq; Type: SEQUENCE; Schema: public; Owner: Dalia
--

CREATE SEQUENCE public.wet_mixing_methods_wet_mixing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wet_mixing_methods_wet_mixing_id_seq OWNER TO "Dalia";

--
-- Name: wet_mixing_methods_wet_mixing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: Dalia
--

ALTER SEQUENCE public.wet_mixing_methods_wet_mixing_id_seq OWNED BY public.wet_mixing_methods.wet_mixing_id;


--
-- Name: active_materials active_material_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.active_materials ALTER COLUMN active_material_id SET DEFAULT nextval('public.active_materials_active_material_id_seq'::regclass);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: auth_log id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.auth_log ALTER COLUMN id SET DEFAULT nextval('public.auth_log_id_seq'::regclass);


--
-- Name: batteries battery_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.batteries ALTER COLUMN battery_id SET DEFAULT nextval('public.batteries_battery_id_seq'::regclass);


--
-- Name: battery_electrolyte battery_electrolyte_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrolyte ALTER COLUMN battery_electrolyte_id SET DEFAULT nextval('public.battery_electrolyte_battery_electrolyte_id_seq'::regclass);


--
-- Name: coating_methods coating_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.coating_methods ALTER COLUMN coating_id SET DEFAULT nextval('public.coating_methods_coating_id_seq'::regclass);


--
-- Name: departments department_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.departments ALTER COLUMN department_id SET DEFAULT nextval('public.departments_department_id_seq'::regclass);


--
-- Name: dry_mixing_methods dry_mixing_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.dry_mixing_methods ALTER COLUMN dry_mixing_id SET DEFAULT nextval('public.dry_mixing_methods_dry_mixing_id_seq'::regclass);


--
-- Name: drying_atmospheres drying_atmosphere_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.drying_atmospheres ALTER COLUMN drying_atmosphere_id SET DEFAULT nextval('public.drying_atmospheres_drying_atmosphere_id_seq'::regclass);


--
-- Name: electrode_cut_batches cut_batch_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_cut_batches ALTER COLUMN cut_batch_id SET DEFAULT nextval('public.electrode_cut_batches_cut_batch_id_seq'::regclass);


--
-- Name: electrode_drying drying_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_drying ALTER COLUMN drying_id SET DEFAULT nextval('public.electrode_drying_drying_id_seq'::regclass);


--
-- Name: electrodes electrode_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes ALTER COLUMN electrode_id SET DEFAULT nextval('public.electrodes_electrode_id_seq'::regclass);


--
-- Name: electrolytes electrolyte_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrolytes ALTER COLUMN electrolyte_id SET DEFAULT nextval('public.electrolytes_electrolyte_id_seq'::regclass);


--
-- Name: foil_mass_measurements foil_measurement_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foil_mass_measurements ALTER COLUMN foil_measurement_id SET DEFAULT nextval('public.foil_mass_measurements_foil_measurement_id_seq'::regclass);


--
-- Name: foils foil_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foils ALTER COLUMN foil_id SET DEFAULT nextval('public.foils_foil_id_seq'::regclass);


--
-- Name: material_instance_components material_instance_component_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instance_components ALTER COLUMN material_instance_component_id SET DEFAULT nextval('public.material_instance_components_material_instance_component_id_seq'::regclass);


--
-- Name: material_instances material_instance_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instances ALTER COLUMN material_instance_id SET DEFAULT nextval('public.material_instances_material_instance_id_seq'::regclass);


--
-- Name: materials material_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.materials ALTER COLUMN material_id SET DEFAULT nextval('public.materials_material_id_seq'::regclass);


--
-- Name: modules module_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.modules ALTER COLUMN module_id SET DEFAULT nextval('public.modules_module_id_seq'::regclass);


--
-- Name: operation_types operation_type_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.operation_types ALTER COLUMN operation_type_id SET DEFAULT nextval('public.operation_types_operation_type_id_seq'::regclass);


--
-- Name: projects project_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects ALTER COLUMN project_id SET DEFAULT nextval('public.projects_project_id_seq'::regclass);


--
-- Name: separator_structure sep_str_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separator_structure ALTER COLUMN sep_str_id SET DEFAULT nextval('public.separator_structure_sep_str_id_seq'::regclass);


--
-- Name: separators sep_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separators ALTER COLUMN sep_id SET DEFAULT nextval('public.separators_sep_id_seq'::regclass);


--
-- Name: tape_process_steps step_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps ALTER COLUMN step_id SET DEFAULT nextval('public.tape_process_steps_step_id_seq'::regclass);


--
-- Name: tape_recipe_line_actuals actual_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals ALTER COLUMN actual_id SET DEFAULT nextval('public.tape_recipe_line_actuals_actual_id_seq'::regclass);


--
-- Name: tape_recipe_lines recipe_line_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_lines ALTER COLUMN recipe_line_id SET DEFAULT nextval('public.tape_recipe_lines_recipe_line_id_seq'::regclass);


--
-- Name: tape_recipes tape_recipe_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipes ALTER COLUMN tape_recipe_id SET DEFAULT nextval('public.tape_recipes_tape_recipe_id_seq'::regclass);


--
-- Name: tapes tape_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tapes ALTER COLUMN tape_id SET DEFAULT nextval('public.tapes_tape_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: wet_mixing_methods wet_mixing_id; Type: DEFAULT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.wet_mixing_methods ALTER COLUMN wet_mixing_id SET DEFAULT nextval('public.wet_mixing_methods_wet_mixing_id_seq'::regclass);


--
-- Name: active_materials active_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.active_materials
    ADD CONSTRAINT active_materials_pkey PRIMARY KEY (active_material_id);


--
-- Name: active_materials active_materials_unique_instance; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.active_materials
    ADD CONSTRAINT active_materials_unique_instance UNIQUE (material_instance_id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: auth_log auth_log_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.auth_log
    ADD CONSTRAINT auth_log_pkey PRIMARY KEY (id);


--
-- Name: batteries batteries_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.batteries
    ADD CONSTRAINT batteries_pkey PRIMARY KEY (battery_id);


--
-- Name: battery_coin_config battery_coin_config_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_coin_config
    ADD CONSTRAINT battery_coin_config_pkey PRIMARY KEY (battery_id);


--
-- Name: battery_cyl_config battery_cyl_config_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_cyl_config
    ADD CONSTRAINT battery_cyl_config_pkey PRIMARY KEY (battery_id);


--
-- Name: battery_electrochem battery_electrochem_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrochem
    ADD CONSTRAINT battery_electrochem_pkey PRIMARY KEY (battery_electrochem_id);


--
-- Name: battery_electrode_sources battery_electrode_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrode_sources
    ADD CONSTRAINT battery_electrode_sources_pkey PRIMARY KEY (battery_id, role);


--
-- Name: battery_electrodes battery_electrodes_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrodes
    ADD CONSTRAINT battery_electrodes_pkey PRIMARY KEY (battery_id, electrode_id);


--
-- Name: battery_electrodes battery_electrodes_unique_position; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrodes
    ADD CONSTRAINT battery_electrodes_unique_position UNIQUE (battery_id, position_index);


--
-- Name: battery_electrolyte battery_electrolyte_battery_id_unique; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrolyte
    ADD CONSTRAINT battery_electrolyte_battery_id_unique UNIQUE (battery_id);


--
-- Name: battery_electrolyte battery_electrolyte_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrolyte
    ADD CONSTRAINT battery_electrolyte_pkey PRIMARY KEY (battery_electrolyte_id);


--
-- Name: battery_pouch_config battery_pouch_config_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_pouch_config
    ADD CONSTRAINT battery_pouch_config_pkey PRIMARY KEY (battery_id);


--
-- Name: battery_qc battery_qc_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_qc
    ADD CONSTRAINT battery_qc_pkey PRIMARY KEY (battery_id);


--
-- Name: battery_sep_config battery_sep_config_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_sep_config
    ADD CONSTRAINT battery_sep_config_pkey PRIMARY KEY (battery_id);


--
-- Name: coating_methods coating_methods_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.coating_methods
    ADD CONSTRAINT coating_methods_name_key UNIQUE (name);


--
-- Name: coating_methods coating_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.coating_methods
    ADD CONSTRAINT coating_methods_pkey PRIMARY KEY (coating_id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (department_id);


--
-- Name: dry_mixing_methods dry_mixing_methods_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.dry_mixing_methods
    ADD CONSTRAINT dry_mixing_methods_name_key UNIQUE (name);


--
-- Name: dry_mixing_methods dry_mixing_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.dry_mixing_methods
    ADD CONSTRAINT dry_mixing_methods_pkey PRIMARY KEY (dry_mixing_id);


--
-- Name: drying_atmospheres drying_atmospheres_code_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.drying_atmospheres
    ADD CONSTRAINT drying_atmospheres_code_key UNIQUE (code);


--
-- Name: drying_atmospheres drying_atmospheres_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.drying_atmospheres
    ADD CONSTRAINT drying_atmospheres_pkey PRIMARY KEY (drying_atmosphere_id);


--
-- Name: electrode_cut_batches electrode_cut_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_cut_batches
    ADD CONSTRAINT electrode_cut_batches_pkey PRIMARY KEY (cut_batch_id);


--
-- Name: electrode_drying electrode_drying_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_drying
    ADD CONSTRAINT electrode_drying_pkey PRIMARY KEY (drying_id);


--
-- Name: electrode_status electrode_status_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_status
    ADD CONSTRAINT electrode_status_name_key UNIQUE (name);


--
-- Name: electrode_status electrode_status_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_status
    ADD CONSTRAINT electrode_status_pkey PRIMARY KEY (status_code);


--
-- Name: electrodes electrodes_cut_batch_id_number_in_batch_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes
    ADD CONSTRAINT electrodes_cut_batch_id_number_in_batch_key UNIQUE (cut_batch_id, number_in_batch);


--
-- Name: electrodes electrodes_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes
    ADD CONSTRAINT electrodes_pkey PRIMARY KEY (electrode_id);


--
-- Name: electrolyte_files electrolyte_files_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrolyte_files
    ADD CONSTRAINT electrolyte_files_pkey PRIMARY KEY (electrolyte_file_id);


--
-- Name: electrolytes electrolytes_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrolytes
    ADD CONSTRAINT electrolytes_pkey PRIMARY KEY (electrolyte_id);


--
-- Name: foil_mass_measurements foil_mass_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foil_mass_measurements
    ADD CONSTRAINT foil_mass_measurements_pkey PRIMARY KEY (foil_measurement_id);


--
-- Name: foils foils_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foils
    ADD CONSTRAINT foils_pkey PRIMARY KEY (foil_id);


--
-- Name: foils foils_type_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foils
    ADD CONSTRAINT foils_type_key UNIQUE (type);


--
-- Name: material_instance_components material_instance_components_parent_material_instance_id_co_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instance_components
    ADD CONSTRAINT material_instance_components_parent_material_instance_id_co_key UNIQUE (parent_material_instance_id, component_material_instance_id);


--
-- Name: material_instance_components material_instance_components_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instance_components
    ADD CONSTRAINT material_instance_components_pkey PRIMARY KEY (material_instance_component_id);


--
-- Name: material_instances material_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instances
    ADD CONSTRAINT material_instances_pkey PRIMARY KEY (material_instance_id);


--
-- Name: materials materials_name_unique; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_name_unique UNIQUE (name);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (material_id);


--
-- Name: module_batteries module_batteries_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.module_batteries
    ADD CONSTRAINT module_batteries_pkey PRIMARY KEY (module_id, battery_id);


--
-- Name: module_qc module_qc_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.module_qc
    ADD CONSTRAINT module_qc_pkey PRIMARY KEY (module_id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (module_id);


--
-- Name: electrode_drying one_drying_per_batch; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_drying
    ADD CONSTRAINT one_drying_per_batch UNIQUE (cut_batch_id);


--
-- Name: operation_types operation_types_code_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.operation_types
    ADD CONSTRAINT operation_types_code_key UNIQUE (code);


--
-- Name: operation_types operation_types_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.operation_types
    ADD CONSTRAINT operation_types_pkey PRIMARY KEY (operation_type_id);


--
-- Name: projects projects_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_name_key UNIQUE (name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (project_id);


--
-- Name: separator_files separator_files_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separator_files
    ADD CONSTRAINT separator_files_pkey PRIMARY KEY (separator_file_id);


--
-- Name: separator_structure separator_structure_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separator_structure
    ADD CONSTRAINT separator_structure_name_key UNIQUE (name);


--
-- Name: separator_structure separator_structure_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separator_structure
    ADD CONSTRAINT separator_structure_pkey PRIMARY KEY (sep_str_id);


--
-- Name: separators separators_name_batch_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separators
    ADD CONSTRAINT separators_name_batch_key UNIQUE (name, batch);


--
-- Name: separators separators_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separators
    ADD CONSTRAINT separators_pkey PRIMARY KEY (sep_id);


--
-- Name: tape_process_steps tape_process_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps
    ADD CONSTRAINT tape_process_steps_pkey PRIMARY KEY (step_id);


--
-- Name: tape_process_steps tape_process_steps_tape_operation_unique; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps
    ADD CONSTRAINT tape_process_steps_tape_operation_unique UNIQUE (tape_id, operation_type_id);


--
-- Name: tape_recipe_line_actuals tape_recipe_line_actuals_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals
    ADD CONSTRAINT tape_recipe_line_actuals_pkey PRIMARY KEY (actual_id);


--
-- Name: tape_recipe_line_actuals tape_recipe_line_actuals_tape_id_recipe_line_id_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals
    ADD CONSTRAINT tape_recipe_line_actuals_tape_id_recipe_line_id_key UNIQUE (tape_id, recipe_line_id);


--
-- Name: tape_recipe_lines tape_recipe_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_lines
    ADD CONSTRAINT tape_recipe_lines_pkey PRIMARY KEY (recipe_line_id);


--
-- Name: tape_recipes tape_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipes
    ADD CONSTRAINT tape_recipes_pkey PRIMARY KEY (tape_recipe_id);


--
-- Name: tape_step_calendering tape_step_calendering_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_calendering
    ADD CONSTRAINT tape_step_calendering_pkey PRIMARY KEY (step_id);


--
-- Name: tape_step_coating tape_step_coating_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_coating
    ADD CONSTRAINT tape_step_coating_pkey PRIMARY KEY (step_id);


--
-- Name: tape_step_drying tape_step_drying_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_drying
    ADD CONSTRAINT tape_step_drying_pkey PRIMARY KEY (step_id);


--
-- Name: tape_step_mixing tape_step_mixing_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_mixing
    ADD CONSTRAINT tape_step_mixing_pkey PRIMARY KEY (step_id);


--
-- Name: tapes tapes_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tapes
    ADD CONSTRAINT tapes_pkey PRIMARY KEY (tape_id);


--
-- Name: user_project_access user_project_access_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.user_project_access
    ADD CONSTRAINT user_project_access_pkey PRIMARY KEY (user_id, project_id);


--
-- Name: users users_login_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_key UNIQUE (login);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_user_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_name_key UNIQUE (name);


--
-- Name: wet_mixing_methods wet_mixing_methods_name_key; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.wet_mixing_methods
    ADD CONSTRAINT wet_mixing_methods_name_key UNIQUE (name);


--
-- Name: wet_mixing_methods wet_mixing_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.wet_mixing_methods
    ADD CONSTRAINT wet_mixing_methods_pkey PRIMARY KEY (wet_mixing_id);


--
-- Name: idx_activity_log_created; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_activity_log_created ON public.activity_log USING btree (created_at);


--
-- Name: idx_activity_log_entity; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_activity_log_entity ON public.activity_log USING btree (entity, entity_id);


--
-- Name: idx_activity_log_user; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_activity_log_user ON public.activity_log USING btree (user_id);


--
-- Name: idx_actuals_material_instance; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_actuals_material_instance ON public.tape_recipe_line_actuals USING btree (material_instance_id);


--
-- Name: idx_auth_log_created; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_auth_log_created ON public.auth_log USING btree (created_at);


--
-- Name: idx_auth_log_event; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_auth_log_event ON public.auth_log USING btree (event);


--
-- Name: idx_auth_log_user; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_auth_log_user ON public.auth_log USING btree (user_id);


--
-- Name: idx_battery_electrodes_electrode; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_battery_electrodes_electrode ON public.battery_electrodes USING btree (electrode_id);


--
-- Name: idx_electrode_drying_cut_batch; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_electrode_drying_cut_batch ON public.electrode_drying USING btree (cut_batch_id);


--
-- Name: idx_electrodes_used_in_battery; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_electrodes_used_in_battery ON public.electrodes USING btree (used_in_battery_id);


--
-- Name: idx_electrolyte_files_electrolyte_id; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_electrolyte_files_electrolyte_id ON public.electrolyte_files USING btree (electrolyte_id);


--
-- Name: idx_material_instances_material; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_material_instances_material ON public.material_instances USING btree (material_id);


--
-- Name: idx_mic_component; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_mic_component ON public.material_instance_components USING btree (component_material_instance_id);


--
-- Name: idx_mic_parent; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_mic_parent ON public.material_instance_components USING btree (parent_material_instance_id);


--
-- Name: idx_operation_types_ui_order; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_operation_types_ui_order ON public.operation_types USING btree (ui_order);


--
-- Name: idx_recipe_lines_recipe; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_recipe_lines_recipe ON public.tape_recipe_lines USING btree (tape_recipe_id);


--
-- Name: idx_separators_structure; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_separators_structure ON public.separators USING btree (structure_id);


--
-- Name: idx_tapes_recipe; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_tapes_recipe ON public.tapes USING btree (tape_recipe_id);


--
-- Name: idx_users_login_lower; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_users_login_lower ON public.users USING btree (lower((login)::text));


--
-- Name: battery_electrodes battery_stack_validate; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER battery_stack_validate BEFORE INSERT OR UPDATE ON public.battery_electrodes FOR EACH ROW EXECUTE FUNCTION public.validate_battery_stack();


--
-- Name: batteries trg_batteries_set_updated_at; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_batteries_set_updated_at BEFORE UPDATE ON public.batteries FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();


--
-- Name: battery_coin_config trg_battery_coin_config_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_coin_config_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_coin_config FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_cyl_config trg_battery_cyl_config_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_cyl_config_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_cyl_config FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_electrochem trg_battery_electrochem_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_electrochem_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_electrochem FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_electrode_sources trg_battery_electrode_sources_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_electrode_sources_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_electrode_sources FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_electrodes trg_battery_electrodes_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_electrodes_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_electrodes FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_electrolyte trg_battery_electrolyte_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_electrolyte_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_electrolyte FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_pouch_config trg_battery_pouch_config_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_pouch_config_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_pouch_config FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_qc trg_battery_qc_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_qc_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_qc FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: battery_sep_config trg_battery_sep_config_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_battery_sep_config_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.battery_sep_config FOR EACH ROW EXECUTE FUNCTION public.touch_parent_battery_from_battery_id();


--
-- Name: tape_process_steps trg_tape_process_steps_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_process_steps_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_process_steps FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_tape_id();


--
-- Name: tape_recipe_line_actuals trg_tape_recipe_line_actuals_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_recipe_line_actuals_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_recipe_line_actuals FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_tape_id();


--
-- Name: tape_step_calendering trg_tape_step_calendering_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_step_calendering_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_step_calendering FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_step_id();


--
-- Name: tape_step_coating trg_tape_step_coating_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_step_coating_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_step_coating FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_step_id();


--
-- Name: tape_step_drying trg_tape_step_drying_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_step_drying_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_step_drying FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_step_id();


--
-- Name: tape_step_mixing trg_tape_step_mixing_touch_parent; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tape_step_mixing_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.tape_step_mixing FOR EACH ROW EXECUTE FUNCTION public.touch_parent_tape_from_step_id();


--
-- Name: tapes trg_tapes_set_updated_at; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER trg_tapes_set_updated_at BEFORE UPDATE ON public.tapes FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();


--
-- Name: active_materials active_materials_material_instance_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.active_materials
    ADD CONSTRAINT active_materials_material_instance_fkey FOREIGN KEY (material_instance_id) REFERENCES public.material_instances(material_instance_id) ON DELETE CASCADE;


--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: auth_log auth_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.auth_log
    ADD CONSTRAINT auth_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: batteries batteries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.batteries
    ADD CONSTRAINT batteries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: batteries batteries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.batteries
    ADD CONSTRAINT batteries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id);


--
-- Name: battery_coin_config battery_coin_config_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_coin_config
    ADD CONSTRAINT battery_coin_config_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_cyl_config battery_cyl_config_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_cyl_config
    ADD CONSTRAINT battery_cyl_config_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_electrochem battery_electrochem_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrochem
    ADD CONSTRAINT battery_electrochem_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_electrode_sources battery_electrode_sources_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrode_sources
    ADD CONSTRAINT battery_electrode_sources_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_electrode_sources battery_electrode_sources_cut_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrode_sources
    ADD CONSTRAINT battery_electrode_sources_cut_batch_id_fkey FOREIGN KEY (cut_batch_id) REFERENCES public.electrode_cut_batches(cut_batch_id);


--
-- Name: battery_electrode_sources battery_electrode_sources_tape_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrode_sources
    ADD CONSTRAINT battery_electrode_sources_tape_id_fkey FOREIGN KEY (tape_id) REFERENCES public.tapes(tape_id);


--
-- Name: battery_electrodes battery_electrodes_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrodes
    ADD CONSTRAINT battery_electrodes_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_electrodes battery_electrodes_electrode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrodes
    ADD CONSTRAINT battery_electrodes_electrode_id_fkey FOREIGN KEY (electrode_id) REFERENCES public.electrodes(electrode_id);


--
-- Name: battery_electrolyte battery_electrolyte_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrolyte
    ADD CONSTRAINT battery_electrolyte_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_electrolyte battery_electrolyte_electrolyte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_electrolyte
    ADD CONSTRAINT battery_electrolyte_electrolyte_id_fkey FOREIGN KEY (electrolyte_id) REFERENCES public.electrolytes(electrolyte_id);


--
-- Name: battery_pouch_config battery_pouch_config_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_pouch_config
    ADD CONSTRAINT battery_pouch_config_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_qc battery_qc_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_qc
    ADD CONSTRAINT battery_qc_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_sep_config battery_sep_config_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_sep_config
    ADD CONSTRAINT battery_sep_config_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: battery_sep_config battery_sep_config_separator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.battery_sep_config
    ADD CONSTRAINT battery_sep_config_separator_id_fkey FOREIGN KEY (separator_id) REFERENCES public.separators(sep_id);


--
-- Name: departments departments_head_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_head_user_id_fkey FOREIGN KEY (head_user_id) REFERENCES public.users(user_id);


--
-- Name: electrode_cut_batches electrode_cut_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_cut_batches
    ADD CONSTRAINT electrode_cut_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: electrode_cut_batches electrode_cut_batches_tape_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_cut_batches
    ADD CONSTRAINT electrode_cut_batches_tape_id_fkey FOREIGN KEY (tape_id) REFERENCES public.tapes(tape_id) ON DELETE CASCADE;


--
-- Name: electrode_drying electrode_drying_cut_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrode_drying
    ADD CONSTRAINT electrode_drying_cut_batch_fk FOREIGN KEY (cut_batch_id) REFERENCES public.electrode_cut_batches(cut_batch_id) ON DELETE CASCADE;


--
-- Name: electrodes electrodes_cut_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes
    ADD CONSTRAINT electrodes_cut_batch_id_fkey FOREIGN KEY (cut_batch_id) REFERENCES public.electrode_cut_batches(cut_batch_id) ON DELETE CASCADE;


--
-- Name: electrodes electrodes_status_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes
    ADD CONSTRAINT electrodes_status_code_fkey FOREIGN KEY (status_code) REFERENCES public.electrode_status(status_code);


--
-- Name: electrodes electrodes_used_in_battery_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrodes
    ADD CONSTRAINT electrodes_used_in_battery_fkey FOREIGN KEY (used_in_battery_id) REFERENCES public.batteries(battery_id) ON DELETE SET NULL;


--
-- Name: electrolyte_files electrolyte_files_electrolyte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrolyte_files
    ADD CONSTRAINT electrolyte_files_electrolyte_id_fkey FOREIGN KEY (electrolyte_id) REFERENCES public.electrolytes(electrolyte_id) ON DELETE CASCADE;


--
-- Name: electrolytes electrolytes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.electrolytes
    ADD CONSTRAINT electrolytes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: foil_mass_measurements foil_mass_measurements_cut_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.foil_mass_measurements
    ADD CONSTRAINT foil_mass_measurements_cut_batch_id_fkey FOREIGN KEY (cut_batch_id) REFERENCES public.electrode_cut_batches(cut_batch_id) ON DELETE CASCADE;


--
-- Name: material_instance_components material_instance_components_component_material_instance_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instance_components
    ADD CONSTRAINT material_instance_components_component_material_instance_i_fkey FOREIGN KEY (component_material_instance_id) REFERENCES public.material_instances(material_instance_id) ON DELETE RESTRICT;


--
-- Name: material_instance_components material_instance_components_parent_material_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instance_components
    ADD CONSTRAINT material_instance_components_parent_material_instance_id_fkey FOREIGN KEY (parent_material_instance_id) REFERENCES public.material_instances(material_instance_id) ON DELETE CASCADE;


--
-- Name: material_instances material_instances_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.material_instances
    ADD CONSTRAINT material_instances_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(material_id) ON DELETE RESTRICT;


--
-- Name: module_batteries module_batteries_battery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.module_batteries
    ADD CONSTRAINT module_batteries_battery_id_fkey FOREIGN KEY (battery_id) REFERENCES public.batteries(battery_id) ON DELETE CASCADE;


--
-- Name: module_batteries module_batteries_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.module_batteries
    ADD CONSTRAINT module_batteries_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(module_id) ON DELETE CASCADE;


--
-- Name: module_qc module_qc_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.module_qc
    ADD CONSTRAINT module_qc_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(module_id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: projects projects_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- Name: projects projects_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.users(user_id);


--
-- Name: separator_files separator_files_sep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separator_files
    ADD CONSTRAINT separator_files_sep_id_fkey FOREIGN KEY (sep_id) REFERENCES public.separators(sep_id) ON DELETE CASCADE;


--
-- Name: separators separators_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separators
    ADD CONSTRAINT separators_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: separators separators_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.separators
    ADD CONSTRAINT separators_structure_id_fkey FOREIGN KEY (structure_id) REFERENCES public.separator_structure(sep_str_id);


--
-- Name: tape_process_steps tape_process_steps_operation_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps
    ADD CONSTRAINT tape_process_steps_operation_type_id_fkey FOREIGN KEY (operation_type_id) REFERENCES public.operation_types(operation_type_id);


--
-- Name: tape_process_steps tape_process_steps_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps
    ADD CONSTRAINT tape_process_steps_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(user_id);


--
-- Name: tape_process_steps tape_process_steps_tape_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_process_steps
    ADD CONSTRAINT tape_process_steps_tape_id_fkey FOREIGN KEY (tape_id) REFERENCES public.tapes(tape_id) ON DELETE CASCADE;


--
-- Name: tape_recipe_line_actuals tape_recipe_line_actuals_material_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals
    ADD CONSTRAINT tape_recipe_line_actuals_material_instance_id_fkey FOREIGN KEY (material_instance_id) REFERENCES public.material_instances(material_instance_id);


--
-- Name: tape_recipe_line_actuals tape_recipe_line_actuals_recipe_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals
    ADD CONSTRAINT tape_recipe_line_actuals_recipe_line_id_fkey FOREIGN KEY (recipe_line_id) REFERENCES public.tape_recipe_lines(recipe_line_id);


--
-- Name: tape_recipe_line_actuals tape_recipe_line_actuals_tape_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_line_actuals
    ADD CONSTRAINT tape_recipe_line_actuals_tape_id_fkey FOREIGN KEY (tape_id) REFERENCES public.tapes(tape_id) ON DELETE CASCADE;


--
-- Name: tape_recipe_lines tape_recipe_lines_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_lines
    ADD CONSTRAINT tape_recipe_lines_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(material_id);


--
-- Name: tape_recipe_lines tape_recipe_lines_tape_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipe_lines
    ADD CONSTRAINT tape_recipe_lines_tape_recipe_id_fkey FOREIGN KEY (tape_recipe_id) REFERENCES public.tape_recipes(tape_recipe_id) ON DELETE CASCADE;


--
-- Name: tape_recipes tape_recipes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_recipes
    ADD CONSTRAINT tape_recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: tape_step_calendering tape_step_calendering_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_calendering
    ADD CONSTRAINT tape_step_calendering_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.tape_process_steps(step_id) ON DELETE CASCADE;


--
-- Name: tape_step_coating tape_step_coating_coating_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_coating
    ADD CONSTRAINT tape_step_coating_coating_id_fkey FOREIGN KEY (coating_id) REFERENCES public.coating_methods(coating_id);


--
-- Name: tape_step_coating tape_step_coating_foil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_coating
    ADD CONSTRAINT tape_step_coating_foil_id_fkey FOREIGN KEY (foil_id) REFERENCES public.foils(foil_id);


--
-- Name: tape_step_coating tape_step_coating_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_coating
    ADD CONSTRAINT tape_step_coating_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.tape_process_steps(step_id) ON DELETE CASCADE;


--
-- Name: tape_step_drying tape_step_drying_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_drying
    ADD CONSTRAINT tape_step_drying_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.tape_process_steps(step_id) ON DELETE CASCADE;


--
-- Name: tape_step_mixing tape_step_mixing_dry_mixing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_mixing
    ADD CONSTRAINT tape_step_mixing_dry_mixing_id_fkey FOREIGN KEY (dry_mixing_id) REFERENCES public.dry_mixing_methods(dry_mixing_id);


--
-- Name: tape_step_mixing tape_step_mixing_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_mixing
    ADD CONSTRAINT tape_step_mixing_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.tape_process_steps(step_id) ON DELETE CASCADE;


--
-- Name: tape_step_mixing tape_step_mixing_wet_mixing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tape_step_mixing
    ADD CONSTRAINT tape_step_mixing_wet_mixing_id_fkey FOREIGN KEY (wet_mixing_id) REFERENCES public.wet_mixing_methods(wet_mixing_id);


--
-- Name: tapes tapes_prepared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tapes
    ADD CONSTRAINT tapes_prepared_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: tapes tapes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tapes
    ADD CONSTRAINT tapes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id);


--
-- Name: tapes tapes_tape_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.tapes
    ADD CONSTRAINT tapes_tape_recipe_id_fkey FOREIGN KEY (tape_recipe_id) REFERENCES public.tape_recipes(tape_recipe_id);


--
-- Name: user_project_access user_project_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.user_project_access
    ADD CONSTRAINT user_project_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(user_id);


--
-- Name: user_project_access user_project_access_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.user_project_access
    ADD CONSTRAINT user_project_access_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: user_project_access user_project_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.user_project_access
    ADD CONSTRAINT user_project_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: users users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- PostgreSQL database dump complete
--

\unrestrict qaANycddtf0u3AyP9S3LeGDmZjgxTNFbPYvFBbIcBEpGegD64MInS2fXPyZ4MHJ

