--
-- PostgreSQL database dump
--

\restrict dXargHaZUcTg94IXS6BVpbRNw1RBEu8Fw4s86IPfwmybIvJwjJpIHBeEcOyyiDd

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
    electrolyte_drop_count integer,
    electrolyte_drop_volume numeric,
    coin_layout_notes text,
    spacer_notes text
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
    pouch_notes text
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    comments text
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
    coating_id integer
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
    viscosity_cp numeric
);


ALTER TABLE public.tape_step_mixing OWNER TO "Dalia";

--
-- Name: tapes; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.tapes (
    tape_id integer NOT NULL,
    project_id integer NOT NULL,
    tape_recipe_id integer NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.tape_status,
    notes text,
    name text DEFAULT 'Unnamed tape'::text NOT NULL,
    calc_mode public.tape_calc_mode,
    target_mass_g numeric
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
-- Name: users; Type: TABLE; Schema: public; Owner: Dalia
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true
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
-- Data for Name: active_materials; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.active_materials (active_material_id, role, th_capacity_mah, th_capacity_ma_g, created_at, material_instance_id) FROM stdin;
\.


--
-- Data for Name: batteries; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.batteries (battery_id, project_id, form_factor, created_by, created_at, status, battery_notes) FROM stdin;
1	3	coin	33	2026-03-20 17:30:29.409995+03	assembled	coin full
2	3	coin	33	2026-03-20 18:04:21.883615+03	assembled	coin
3	3	coin	33	2026-03-20 18:21:55.744607+03	assembled	comment
4	3	coin	33	2026-03-20 18:47:27.462016+03	assembled	comment
\.


--
-- Data for Name: battery_coin_config; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_coin_config (battery_id, half_cell_type, coin_cell_mode, coin_size_code, li_foil_notes, spacer_thickness_mm, spacer_count, coin_layout, electrolyte_drop_count, electrolyte_drop_volume, coin_layout_notes, spacer_notes) FROM stdin;
1	\N	full_cell	2032	\N	0.5	2	SEE	2	50	see	space
2	cathode_vs_li	half_cell	2032	half cell cathode	0.5	2	SEE	2	50	\N	\N
3	cathode_vs_li	half_cell	2032	\N	\N	\N	\N	\N	\N	\N	\N
4	\N	full_cell	2032	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: battery_cyl_config; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_cyl_config (battery_id, cyl_size_code, cyl_notes) FROM stdin;
\.


--
-- Data for Name: battery_electrochem; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_electrochem (battery_electrochem_id, battery_id, file_name, file_link, electrochem_notes, uploaded_at) FROM stdin;
1	1	1-tapes.html	/uploads/electrochem/1774017119980_83ji8u_1-tapes.html	\N	2026-03-20 17:31:59.982434+03
2	1	3-batteries.html	/uploads/electrochem/1774017119987_v4m9pb_3-batteries.html	\N	2026-03-20 17:31:59.987583+03
3	1	2-electrodes.html	/uploads/electrochem/1774017119988_jyq09b_2-electrodes.html	\N	2026-03-20 17:31:59.98878+03
4	1	5-testing.html	/uploads/electrochem/1774017119989_x7i31o_5-testing.html	\N	2026-03-20 17:31:59.989729+03
5	1	4-modules.html	/uploads/electrochem/1774017119990_csmbci_4-modules.html	\N	2026-03-20 17:31:59.991837+03
\.


--
-- Data for Name: battery_electrode_sources; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_electrode_sources (battery_id, role, tape_id, cut_batch_id, source_notes) FROM stdin;
1	cathode	11	1	cathode notes
1	anode	15	2	anode notes
2	cathode	11	1	\N
3	cathode	11	1	\N
4	cathode	11	1	\N
4	anode	15	2	\N
\.


--
-- Data for Name: battery_electrodes; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_electrodes (battery_id, electrode_id, role, position_index) FROM stdin;
1	12	anode	1
1	1	cathode	2
2	2	cathode	1
3	5	cathode	1
4	16	anode	1
4	6	cathode	2
\.


--
-- Data for Name: battery_electrolyte; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_electrolyte (battery_electrolyte_id, battery_id, electrolyte_id, electrolyte_notes, electrolyte_total_ul) FROM stdin;
1	1	8	el	100.0
2	2	8	e	100.0
\.


--
-- Data for Name: battery_pouch_config; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_pouch_config (battery_id, pouch_notes) FROM stdin;
\.


--
-- Data for Name: battery_qc; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_qc (battery_id, ocv_v, esr_mohm, qc_notes) FROM stdin;
1	1	1	1
\.


--
-- Data for Name: battery_sep_config; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.battery_sep_config (battery_id, separator_id, separator_notes) FROM stdin;
1	13	sep
2	13	s
\.


--
-- Data for Name: coating_methods; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.coating_methods (coating_id, name, gap_um, coat_temp_c, coat_time_min, comments) FROM stdin;
1	dr_blade	\N	\N	\N	Ракель / Dr. Blade (GN-VC-15H)
2	coater_machine	\N	\N	\N	Машина для намазки
\.


--
-- Data for Name: dry_mixing_methods; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.dry_mixing_methods (dry_mixing_id, name, description) FROM stdin;
1	none	Сухую смесь не перемешивали
2	mortar_pestle	Вручную: ступка и пестик
3	spatula	Вручную: шпателем
4	turbula	Турбула / смеситель Шатца
\.


--
-- Data for Name: drying_atmospheres; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.drying_atmospheres (drying_atmosphere_id, code, display, ui_order, is_active) FROM stdin;
1	air	Воздух	0	t
2	vacuum	Вакуум	1	t
3	n2	Азот (N₂)	2	t
4	ar	Аргон (Ar)	3	t
5	dry_room	Сухая комната	4	t
\.


--
-- Data for Name: electrode_cut_batches; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.electrode_cut_batches (cut_batch_id, tape_id, created_by, created_at, comments, shape, diameter_mm, length_mm, width_mm) FROM stdin;
1	11	50	2026-03-11 16:19:02.756627+03	comments	circle	20	\N	\N
2	15	33	2026-03-13 11:26:07.209625+03	el	circle	20	\N	\N
\.


--
-- Data for Name: electrode_drying; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.electrode_drying (drying_id, cut_batch_id, start_time, end_time, temperature_c, other_parameters, comments) FROM stdin;
1	1	2026-03-11 16:26:00+03	2026-03-11 16:28:00+03	70	no additional params	no comment
7	2	2026-03-13 11:25:00+03	2026-03-13 13:25:00+03	80	\N	\N
\.


--
-- Data for Name: electrode_status; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.electrode_status (status_code, name) FROM stdin;
1	available
2	used
3	scrapped
\.


--
-- Data for Name: electrodes; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.electrodes (electrode_id, cut_batch_id, electrode_mass_g, cup_number, scrapped_reason, comments, status_code, used_in_battery_id, number_in_batch) FROM stdin;
12	2	2.14	\N	\N	\N	2	1	2
1	1	2.14	\N	\N	\N	2	1	1
2	1	2.058	\N	\N	\N	2	2	2
4	1	2.053	\N	\N	\N	1	\N	4
5	1	2.043	\N	\N	\N	2	3	5
16	2	2.043	\N	\N	\N	2	4	6
6	1	2.042	\N	\N	\N	2	4	6
9	1	2.026	\N	\N	\N	1	\N	9
13	2	2.057	\N	\N	\N	1	\N	3
20	2	2.013	\N	\N	\N	1	\N	10
15	2	2.053	\N	\N	\N	1	\N	5
3	1	2.057	\N	\N	\N	1	\N	3
17	2	2.033	\N	\N	\N	1	\N	7
14	2	2.056	\N	\N	\N	1	\N	4
7	1	2.035	\N	\N	\N	1	\N	7
19	2	2.02	\N	\N	\N	1	\N	9
10	1	2.025	\N	\N	\N	1	\N	10
18	2	2.023	\N	\N	\N	1	\N	8
11	2	2.15	\N	\N	\N	1	\N	1
8	1	2.029	\N	\N	\N	1	\N	8
\.


--
-- Data for Name: electrolytes; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.electrolytes (electrolyte_id, name, electrolyte_type, solvent_system, salts, concentration, additives, notes, status, created_by, created_at) FROM stdin;
1	TEST Elec 1	liquid	\N	\N	\N	\N	comment	active	33	2026-02-11 02:22:26.40737+03
2	TEST Elec 1 (копия)	liquid	\N	\N	\N	\N	comment	active	34	2026-02-11 02:54:17.669943+03
8	TEST El 3	liquid	\N	\N	\N	\N	\N	active	33	2026-03-16 13:38:42.17344+03
\.


--
-- Data for Name: foil_mass_measurements; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.foil_mass_measurements (foil_measurement_id, cut_batch_id, mass_g, created_at) FROM stdin;
33	1	0.4698	2026-03-19 16:01:04.49221+03
34	1	0.4699	2026-03-19 16:01:04.49504+03
35	1	0.47	2026-03-19 16:01:04.497719+03
36	2	0.4699	2026-03-19 16:03:45.522469+03
37	2	0.47	2026-03-19 16:03:45.52534+03
38	2	0.4698	2026-03-19 16:03:45.527284+03
\.


--
-- Data for Name: foils; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.foils (foil_id, type, comments) FROM stdin;
1	Cu	Для графита
2	Al	Для титанатов
\.


--
-- Data for Name: material_instance_components; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.material_instance_components (material_instance_component_id, parent_material_instance_id, component_material_instance_id, mass_fraction, notes) FROM stdin;
10	30	23	0.015	\N
11	29	24	0.515	\N
12	29	9	0.485	\N
13	32	33	0.004	\N
14	32	25	0.02	\N
15	32	8	0.972	\N
16	32	34	0.0039000000000000003	\N
17	30	9	0.985	\N
18	7	25	0.05	\N
2	7	8	0.95	\N
19	5	8	0.93	\N
20	5	25	0.07	\N
\.


--
-- Data for Name: material_instances; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.material_instances (material_instance_id, material_id, notes, created_at, name) FROM stdin;
7	5	\N	2026-02-19 14:08:54.159656+03	5% Solef 5130 PVDF in NMP
39	22	\N	2026-02-24 12:54:35.690839+03	S360
40	22	\N	2026-02-24 12:54:39.94632+03	AML 403
41	22	\N	2026-02-24 12:55:28.726871+03	SiC
28	7	\N	2026-02-19 20:33:49.717437+03	NMC M2C2
23	10	\N	2026-02-19 20:31:47.905885+03	CMC сухое
24	11	\N	2026-02-19 20:31:57.465104+03	SBR сухое
29	11	\N	2026-02-19 20:35:39.567477+03	51.5% SBR в воде
30	10	\N	2026-02-19 20:36:04.781038+03	1.5% CMC в воде
42	23	\N	2026-02-24 14:40:51.011599+03	NMC C85E сухой
25	5	\N	2026-02-19 20:32:06.618994+03	PVDF сухой
33	13	\N	2026-02-19 21:14:31.315868+03	ОУНТ сухие
5	5	PVDF powder test	2026-02-19 14:07:45.578558+03	7% PVDF in NMP
9	12	\N	2026-02-19 14:43:46.671379+03	DI H2O
10	2	\N	2026-02-19 14:44:12.898832+03	Super P 5130
26	8	\N	2026-02-19 20:33:31.275198+03	LFP S19 TEST
27	4	\N	2026-02-19 20:33:38.894146+03	NMC 811 TEST
8	3	NMP bulk solvent	2026-02-19 14:12:38.574079+03	NMP solvent (pure)
32	13	\N	2026-02-19 20:37:17.300709+03	0.4% ОУНТ
34	19	\N	2026-02-19 21:16:09.793655+03	DMP solvent (pure)
\.


--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.materials (material_id, name, role) FROM stdin;
7	NMC M2C2	cathode_active
23	NMC C85E	cathode_active
5	PVDF	binder
3	NMP	solvent
2	Super P (Сажа)	conductive_additive
10	CMC	binder
11	SBR	binder
12	Вода	solvent
13	ОУНТ	conductive_additive
4	NCM 811	cathode_active
8	LFP S19	cathode_active
19	DMP	solvent
22	Graphite	anode_active
\.


--
-- Data for Name: module_batteries; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.module_batteries (module_id, battery_id, position_index) FROM stdin;
\.


--
-- Data for Name: module_qc; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.module_qc (module_id, module_meas_1, module_meas_2, notes) FROM stdin;
\.


--
-- Data for Name: modules; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.modules (module_id, other_info_about_modules) FROM stdin;
\.


--
-- Data for Name: operation_types; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.operation_types (operation_type_id, code, display, ui_order) FROM stdin;
1	drying_am	Drying AM	0
2	weighing	Weighing	1
3	mixing	Mixing	2
4	coating	Coating	3
5	drying_tape	Drying (tape)	4
6	calendering	Calendering	5
7	drying_pressed_tape	Drying (pressed tape)	6
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.projects (project_id, name, lead_id, start_date, due_date, status, description, created_by, created_at, updated_at) FROM stdin;
4	Project 2	43	2026-02-10	2029-06-04	active	Project 2 comment	43	2026-02-02 16:43:35.323236+03	2026-02-02 16:43:35.323236+03
6	Project 3	47	2026-02-11	\N	active	Comment to project	47	2026-02-12 15:00:07.573411+03	2026-02-12 15:00:15.748864+03
3	Project 1	38	2026-02-01	2028-01-01	active	project 1 comment	38	2026-02-02 16:43:06.370289+03	2026-02-13 11:22:10.394662+03
\.


--
-- Data for Name: separator_structure; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.separator_structure (sep_str_id, name, comments) FROM stdin;
1	PE-PP	comments
4	Coated	comments comments
5	structure 1	\N
6	New structure	comment
7	New structure.v2	\N
\.


--
-- Data for Name: separators; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.separators (sep_id, supplier, name, brand, batch, structure_id, air_perm, air_perm_units, thickness_um, porosity, comments, status, depleted_at, created_by, file, file_path, created_at, updated_at) FROM stdin;
10	Celgard	Celgard 2330	2320	A1 test	1	\N	\N	\N	\N	no comments	available	\N	39	\N	\N	2026-01-30 19:29:30.594069+03	2026-01-30 19:29:30.594069+03
11	\N	Separator	\N	\N	6	\N	\N	\N	\N	\N	available	\N	42	\N	\N	2026-02-01 14:36:40.342922+03	2026-02-01 14:36:40.342922+03
5	Celgard	Celgard 2320	2320	A1 test	7	\N	\N	\N	\N	no comments	available	\N	33	\N	\N	2026-01-30 15:02:58.964101+03	2026-01-30 15:02:58.964101+03
13	NewLine	A new separator	123	321	4	\N	\N	\N	\N	\N	available	\N	33	\N	\N	2026-03-16 12:03:05.629856+03	2026-03-16 12:03:05.629856+03
14	\N	another new one	\N	\N	6	\N	\N	\N	\N	\N	available	\N	33	\N	\N	2026-03-16 13:38:11.695409+03	2026-03-16 13:38:11.695409+03
\.


--
-- Data for Name: tape_process_steps; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_process_steps (step_id, tape_id, operation_type_id, performed_by, started_at, comments) FROM stdin;
13	9	3	55	2026-03-01 11:07:00+03	new comment test
9	9	1	35	2026-01-01 11:11:00+03	yesterday 2
3	4	1	33	2026-02-26 18:23:00+03	comments
21	4	2	33	2026-03-03 18:54:00+03	hello
98	15	7	33	2026-01-16 17:00:00+03	\N
79	15	3	33	2026-01-16 10:53:00+03	\N
77	15	1	33	2026-01-14 10:51:00+03	\N
41	11	1	33	2026-03-04 16:20:00+03	now
42	11	2	33	2026-03-04 16:21:00+03	mix phase 1 comment
43	11	3	33	2026-03-04 16:23:00+03	mix 1
78	15	2	33	2026-01-15 10:51:00+03	\N
80	15	4	33	2026-01-16 11:00:00+03	\N
95	15	5	33	2026-01-16 12:30:00+03	\N
97	15	6	33	2026-01-16 15:00:00+03	\N
55	11	5	33	2026-03-04 16:27:00+03	come
56	11	6	33	2026-03-04 16:27:00+03	com
57	11	7	33	2026-03-04 16:28:00+03	d
44	11	4	33	2026-03-04 16:25:00+03	now
16	4	3	33	2026-03-04 11:29:00+03	new comment 34
27	4	4	33	2026-02-05 10:58:00+03	test coating
17	4	5	33	2026-02-06 14:32:00+03	oh no did we forget to add some comments here??? 
31	4	6	33	2026-02-07 14:36:00+03	f,mm,sm,
18	4	7	33	2026-02-08 14:30:00+03	hfhfhf
\.


--
-- Data for Name: tape_recipe_line_actuals; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_recipe_line_actuals (actual_id, tape_id, recipe_line_id, measure_mode, actual_mass_g, actual_volume_ml, recorded_at, material_instance_id) FROM stdin;
33	9	96	\N	\N	\N	2026-03-03 10:10:51.725471+03	27
34	9	98	\N	\N	\N	2026-03-03 10:10:51.737802+03	7
35	9	97	\N	\N	\N	2026-03-03 10:10:51.743035+03	10
36	9	99	\N	\N	\N	2026-03-03 10:10:51.74809+03	8
57	11	149	\N	\N	\N	2026-03-05 13:53:48.237351+03	26
58	11	152	\N	\N	\N	2026-03-05 13:53:48.244049+03	7
59	11	150	\N	\N	\N	2026-03-05 13:53:48.24744+03	10
60	11	151	\N	\N	\N	2026-03-05 13:53:48.250802+03	32
61	11	153	\N	\N	\N	2026-03-05 13:53:48.256126+03	8
105	15	167	mass	150.011	\N	2026-03-13 11:09:50.272207+03	40
106	15	169	mass	136.8	\N	2026-03-13 11:09:50.275613+03	30
107	15	170	mass	5.2	\N	2026-03-13 11:09:50.277559+03	29
108	15	168	mass	3.158	\N	2026-03-13 11:09:50.279557+03	10
1	4	149	mass	200	\N	2026-03-04 21:13:16.355147+03	26
4	4	152	mass	41	\N	2026-03-04 21:13:16.359617+03	7
2	4	150	mass	2.06	\N	2026-03-04 21:13:16.362488+03	10
3	4	151	mass	102	\N	2026-03-04 21:13:16.365463+03	32
5	4	153	mass	10	\N	2026-03-04 21:13:16.368088+03	8
\.


--
-- Data for Name: tape_recipe_lines; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_recipe_lines (recipe_line_id, tape_recipe_id, material_id, recipe_role, line_notes, slurry_percent, include_in_pct) FROM stdin;
130	54	2	additive	\N	2.2	t
131	54	5	binder	Solef 5130: 5%	1.8	t
139	56	2	additive	\N	2	t
140	56	10	binder	1.5%	1.3	t
141	56	11	binder	51.1%	1.7	t
129	54	7	cathode_active	\N	96	t
96	47	4	cathode_active	\N	96	t
26	39	4	cathode_active	\N	0	t
97	47	2	additive	\N	2	t
98	47	5	binder	7% PVDF	2	t
28	39	2	additive	\N	0	t
29	39	3	solvent	\N	0	t
149	48	8	cathode_active	\N	96.8	t
150	48	2	additive	\N	1	t
151	48	13	additive	Суспензия НТ: 0.4% ОУНТ, 2.0%, PVDF 97.2% NMP, 0.39% DMP	0.2	t
152	48	5	binder	Solef 5130:  5%	2	t
132	54	3	solvent	\N	\N	f
142	56	12	solvent	\N	\N	f
99	47	3	solvent	\N	\N	f
153	48	3	solvent	\N	\N	f
138	56	22	anode_active	\N	95	t
167	61	22	anode_active	\N	95	t
168	61	2	additive	\N	2	t
169	61	10	binder	\N	1.3	t
170	61	11	binder	\N	1.7	t
\.


--
-- Data for Name: tape_recipes; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_recipes (tape_recipe_id, role, name, variant_label, notes, created_by, created_at) FROM stdin;
39	cathode	TEST NCM 811 Recipe	v1	v1 comment	33	2026-02-09 21:43:38.137357+03
47	cathode	NCM 811	\N	\N	34	2026-02-12 18:36:00.05876+03
54	cathode	NMC M2C2	\N	\N	33	2026-02-18 18:51:12.607111+03
56	anode	S360	\N	\N	33	2026-02-18 18:54:44.505341+03
48	cathode	LFP S19	\N	\N	33	2026-02-13 14:28:32.747597+03
61	anode	AML 403	Расчет состава Gr от 14.01.2026	\N	33	2026-03-13 10:48:12.381848+03
\.


--
-- Data for Name: tape_step_calendering; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_step_calendering (step_id, temp_c, pressure_value, pressure_units, draw_speed_m_min, other_params, init_thickness_microns, final_thickness_microns, no_passes, appearance) FROM stdin;
56	150	1	bar	1	other params	130	90	5	Блеск; Точечки; Другое: other
31	105	45	bar	2	comments for calendering	120	80	5	Блеск; Закрутка; Точечки; Другое: other appearance
97	150	1	kN	1	\N	120	70	5	Блеск; Другое: other - test
\.


--
-- Data for Name: tape_step_coating; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_step_coating (step_id, foil_id, coating_id) FROM stdin;
44	2	2
27	1	2
80	1	2
\.


--
-- Data for Name: tape_step_drying; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_step_drying (step_id, temperature_c, atmosphere, target_duration_min, other_parameters) FROM stdin;
9	79	n2	111	addtnl param
3	60	vacuum	122	new comments comments
41	79	vacuum	120	dry comments
55	91	air	120	fgh
57	80	vacuum	120	d
17	89	vacuum	122	comments
18	76	vacuum	119	hrllo moto
98	80	vacuum	120	\N
77	80	vacuum	120	\N
95	80	air	120	\N
\.


--
-- Data for Name: tape_step_mixing; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tape_step_mixing (step_id, slurry_volume_ml, dry_mixing_id, dry_start_time, dry_duration_min, dry_rpm, wet_mixing_id, wet_start_time, wet_duration_min, wet_rpm, viscosity_cp) FROM stdin;
43	485	4	2026-03-04 16:23:00+03	70	30-60 rpm	3	2026-03-04 16:24:00+03	90	vacuum, T = 25C	\N
16	250	2	2026-03-03 03:29:00+03	111	~122	2	2026-03-03 22:19:00+03	1	1	1100
79	290	4	2026-01-16 07:53:00+03	70	\N	3	2026-01-15 21:30:00+03	90	\N	4363
\.


--
-- Data for Name: tapes; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.tapes (tape_id, project_id, tape_recipe_id, created_by, created_at, status, notes, name, calc_mode, target_mass_g) FROM stdin;
15	3	61	33	2026-03-13 10:49:59.061717+03	\N	\N	TEST Anode Tape - AML 403	from_active_mass	150
9	3	47	33	2026-03-03 10:09:22.888669+03	\N	comments for the NMC tape 3	TEST Tape 3 - NMC 811	from_active_mass	200
4	3	48	33	2026-02-26 17:47:40.460848+03	\N	notes notes notes	TEST Tape 1 - LFP S19	from_active_mass	200
11	3	48	33	2026-03-04 16:20:24.103314+03	\N	new test tape, filled in one go.	TEST Tape 4 - LFP S19	from_active_mass	250
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.users (user_id, name, active) FROM stdin;
34	Irina	t
38	Olga	t
39	Jerald	t
35	Ivan	t
41	New user	t
42	Marina	t
43	Viktor V. Shapovalov	t
45	Roman Batalov	t
47	Karlson	t
49	Julia	t
50	Dalia 2	t
33	Dalia 1	t
51	Dalia 3	t
52	Dalia 4	t
53	Dalia 5	t
55	Dalia 7	t
\.


--
-- Data for Name: wet_mixing_methods; Type: TABLE DATA; Schema: public; Owner: Dalia
--

COPY public.wet_mixing_methods (wet_mixing_id, name, description) FROM stdin;
1	by_hand	Вручную
2	mag_stir	Магнитная мешалка
3	gn_vm_7	Вакуумный миксер GN-VM-7
\.


--
-- Name: active_materials_active_material_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.active_materials_active_material_id_seq', 1, false);


--
-- Name: batteries_battery_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.batteries_battery_id_seq', 4, true);


--
-- Name: battery_electrochem_battery_electrochem_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.battery_electrochem_battery_electrochem_id_seq', 5, true);


--
-- Name: battery_electrolyte_battery_electrolyte_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.battery_electrolyte_battery_electrolyte_id_seq', 2, true);


--
-- Name: coating_methods_coating_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.coating_methods_coating_id_seq', 2, true);


--
-- Name: dry_mixing_methods_dry_mixing_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.dry_mixing_methods_dry_mixing_id_seq', 4, true);


--
-- Name: drying_atmospheres_drying_atmosphere_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.drying_atmospheres_drying_atmosphere_id_seq', 5, true);


--
-- Name: electrode_cut_batches_cut_batch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.electrode_cut_batches_cut_batch_id_seq', 2, true);


--
-- Name: electrode_drying_drying_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.electrode_drying_drying_id_seq', 13, true);


--
-- Name: electrodes_electrode_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.electrodes_electrode_id_seq', 20, true);


--
-- Name: electrolytes_electrolyte_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.electrolytes_electrolyte_id_seq', 8, true);


--
-- Name: foil_mass_measurements_foil_measurement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.foil_mass_measurements_foil_measurement_id_seq', 38, true);


--
-- Name: foils_foil_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.foils_foil_id_seq', 2, true);


--
-- Name: material_instance_components_material_instance_component_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.material_instance_components_material_instance_component_id_seq', 27, true);


--
-- Name: material_instances_material_instance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.material_instances_material_instance_id_seq', 42, true);


--
-- Name: materials_material_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.materials_material_id_seq', 24, true);


--
-- Name: modules_module_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.modules_module_id_seq', 1, false);


--
-- Name: operation_types_operation_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.operation_types_operation_type_id_seq', 7, true);


--
-- Name: projects_project_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.projects_project_id_seq', 7, true);


--
-- Name: separator_structure_sep_str_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.separator_structure_sep_str_id_seq', 7, true);


--
-- Name: separators_sep_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.separators_sep_id_seq', 14, true);


--
-- Name: tape_process_steps_step_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.tape_process_steps_step_id_seq', 105, true);


--
-- Name: tape_recipe_line_actuals_actual_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.tape_recipe_line_actuals_actual_id_seq', 112, true);


--
-- Name: tape_recipe_lines_recipe_line_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.tape_recipe_lines_recipe_line_id_seq', 170, true);


--
-- Name: tape_recipes_tape_recipe_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.tape_recipes_tape_recipe_id_seq', 61, true);


--
-- Name: tapes_tape_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.tapes_tape_id_seq', 15, true);


--
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.users_user_id_seq', 55, true);


--
-- Name: wet_mixing_methods_wet_mixing_id_seq; Type: SEQUENCE SET; Schema: public; Owner: Dalia
--

SELECT pg_catalog.setval('public.wet_mixing_methods_wet_mixing_id_seq', 3, true);


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
-- Name: idx_actuals_material_instance; Type: INDEX; Schema: public; Owner: Dalia
--

CREATE INDEX idx_actuals_material_instance ON public.tape_recipe_line_actuals USING btree (material_instance_id);


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
-- Name: battery_electrodes battery_stack_validate; Type: TRIGGER; Schema: public; Owner: Dalia
--

CREATE TRIGGER battery_stack_validate BEFORE INSERT OR UPDATE ON public.battery_electrodes FOR EACH ROW EXECUTE FUNCTION public.validate_battery_stack();


--
-- Name: active_materials active_materials_material_instance_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.active_materials
    ADD CONSTRAINT active_materials_material_instance_fkey FOREIGN KEY (material_instance_id) REFERENCES public.material_instances(material_instance_id) ON DELETE CASCADE;


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
-- Name: projects projects_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: Dalia
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.users(user_id);


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
-- PostgreSQL database dump complete
--

\unrestrict dXargHaZUcTg94IXS6BVpbRNw1RBEu8Fw4s86IPfwmybIvJwjJpIHBeEcOyyiDd

